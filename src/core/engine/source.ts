import { fail, type ValueFailure } from "@/core/errors/errors";
import { isScalar, KIND_LABEL, kindOf, scalarText, type JsonValue } from "@/core/json/value";
import type { PathRef, Source } from "@/core/mapping/config";
import type { StringJsonLimits } from "@/core/parsing/string-json";
import { formatPath, resolvePath, type Path, type Resolution } from "@/core/paths/path";

export type SourceValue =
  | { state: "value"; value: JsonValue }
  | { state: "missing" }
  | { state: "error"; failure: ValueFailure };

export interface SourceContext {
  record: JsonValue;
  /** 행 펼치기 항목. 펼치기 없음 또는 빈 배열의 blankRow 행이면 undefined */
  item: JsonValue | undefined;
  /** 오류 표시용: 항목의 원본 경로(펼치기 경로 + 인덱스) */
  itemBase: Path;
  limits: StringJsonLimits;
}

type Scope = PathRef["scope"];

function scopeRoot(scope: Scope, ctx: SourceContext): { root: JsonValue | undefined; base: Path } {
  return scope === "record" ? { root: ctx.record, base: [] } : { root: ctx.item, base: ctx.itemBase };
}

function resolveIn(scope: Scope, path: Path, ctx: SourceContext): { resolution: Resolution; base: Path } {
  const { root, base } = scopeRoot(scope, ctx);
  if (root === undefined) return { resolution: { kind: "missing" }, base };
  return { resolution: resolvePath(root, path, ctx.limits, base), base };
}

function fromResolution(resolution: Resolution): SourceValue {
  if (resolution.kind === "value") return { state: "value", value: resolution.value };
  if (resolution.kind === "missing") return { state: "missing" };
  return { state: "error", failure: resolution.failure };
}

function hasContent(value: SourceValue): boolean {
  return value.state === "value" && value.value !== null && value.value !== "";
}

/** 매핑 소스에서 값 하나를 얻는다. 정책(기본값·빈칸·오류) 적용은 호출 측에서 한다. */
export function resolveSource(source: Source, ctx: SourceContext): SourceValue {
  switch (source.kind) {
    case "unmapped":
      return { state: "error", failure: fail("COLUMN_UNMAPPED", "연결되지 않은 컬럼입니다.") };
    case "blank":
      return { state: "value", value: "" };
    case "constant":
      return { state: "value", value: source.value };
    case "path":
      return fromResolution(resolveIn(source.scope, source.path, ctx).resolution);

    case "firstOf": {
      // 상위 우선순위 경로가 손상(오류)이면 다음 경로로 넘어가지 않고 오류로 알린다.
      let sawNull = false;
      let sawEmpty = false;
      for (const ref of source.sources) {
        const value = fromResolution(resolveIn(ref.scope, ref.path, ctx).resolution);
        if (value.state === "error") return value;
        if (hasContent(value)) return value;
        if (value.state === "value" && value.value === null) sawNull = true;
        if (value.state === "value" && value.value === "") sawEmpty = true;
      }
      if (sawEmpty) return { state: "value", value: "" };
      if (sawNull) return { state: "value", value: null };
      return { state: "missing" };
    }

    case "concat": {
      const texts: string[] = [];
      for (const part of source.parts) {
        if (part.kind === "literal") {
          texts.push(part.value);
          continue;
        }
        const { resolution, base } = resolveIn(part.scope, part.path, ctx);
        const value = fromResolution(resolution);
        if (value.state === "error") return value;
        const where = formatPath([...base, ...part.path]);
        if (!hasContent(value)) {
          if (source.skipEmpty) continue;
          return { state: "error", failure: fail("VALUE_MISSING", "결합할 값이 비어 있습니다.", where) };
        }
        const inner = (value as { value: JsonValue }).value;
        if (!isScalar(inner)) {
          return { state: "error", failure: fail("STRUCTURED_VALUE", `${KIND_LABEL[kindOf(inner)]} 값은 결합할 수 없습니다.`, where) };
        }
        texts.push(scalarText(inner));
      }
      return { state: "value", value: texts.join(source.separator) };
    }

    case "pick":
      return pick(source, ctx);
    case "join":
      return join(source, ctx);
  }
}

type PickSource = Extract<Source, { kind: "pick" }>;
type JoinSource = Extract<Source, { kind: "join" }>;

/** 배열 경로를 찾는다. 누락·null은 빈 배열로 본다. */
function resolveArray(scope: Scope, arrayPath: Path, ctx: SourceContext):
  | { ok: true; array: JsonValue[]; base: Path }
  | { ok: false; value: SourceValue } {
  const { resolution, base } = resolveIn(scope, arrayPath, ctx);
  const arrayBase = [...base, ...arrayPath];
  if (resolution.kind === "error") return { ok: false, value: { state: "error", failure: resolution.failure } };
  if (resolution.kind === "missing" || resolution.value === null) return { ok: true, array: [], base: arrayBase };
  if (kindOf(resolution.value) !== "array") {
    return {
      ok: false,
      value: {
        state: "error",
        failure: fail("PATH_TYPE_MISMATCH", `배열이 아니라 ${KIND_LABEL[kindOf(resolution.value)]} 값입니다.`, formatPath(arrayBase)),
      },
    };
  }
  return { ok: true, array: resolution.value as JsonValue[], base: arrayBase };
}

function pick(source: PickSource, ctx: SourceContext): SourceValue {
  const found = resolveArray(source.scope, source.arrayPath, ctx);
  if (!found.ok) return found.value;
  const { array, base } = found;

  let matches: number[];
  if (source.select.by === "index") {
    matches = source.select.index < array.length ? [source.select.index] : [];
  } else {
    matches = [];
    for (let i = 0; i < array.length; i++) {
      const field = resolvePath(array[i], source.select.field, ctx.limits, [...base, i]);
      if (field.kind === "error") return { state: "error", failure: { ...field.failure, code: "ARRAY_ELEMENT_INVALID" } };
      if (field.kind === "value" && isScalar(field.value) && scalarText(field.value) === source.select.equals) {
        matches.push(i);
      }
    }
  }

  const where = formatPath(base);
  if (matches.length === 0) {
    if (source.onNone === "missing") return { state: "missing" };
    return { state: "error", failure: fail("MATCH_NONE", "조건에 맞는 배열 항목이 없습니다.", where) };
  }
  if (matches.length > 1 && source.onMany === "error") {
    return { state: "error", failure: fail("MATCH_AMBIGUOUS", `조건에 맞는 배열 항목이 ${matches.length}개입니다.`, where) };
  }
  const index = matches[0];
  return fromResolution(resolvePath(array[index], source.valuePath, ctx.limits, [...base, index]));
}

function join(source: JoinSource, ctx: SourceContext): SourceValue {
  const found = resolveArray(source.scope, source.arrayPath, ctx);
  if (!found.ok) return found.value;
  const { array, base } = found;

  const texts: string[] = [];
  for (let i = 0; i < array.length; i++) {
    const element = resolvePath(array[i], source.valuePath, ctx.limits, [...base, i]);
    const where = formatPath([...base, i, ...source.valuePath]);
    if (element.kind === "error") return { state: "error", failure: element.failure };
    if (element.kind === "missing" || element.value === null) {
      if (source.skipMissing) continue;
      return { state: "error", failure: fail("ARRAY_ELEMENT_INVALID", "값이 없는 배열 요소가 있습니다.", where) };
    }
    if (!isScalar(element.value)) {
      return { state: "error", failure: fail("STRUCTURED_VALUE", `${KIND_LABEL[kindOf(element.value)]} 요소는 결합할 수 없습니다.`, where) };
    }
    texts.push(scalarText(element.value));
  }
  return { state: "value", value: texts.join(source.separator) };
}
