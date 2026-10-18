import { fail, type ValueFailure } from "@/core/errors/errors";
import { getOwn, KIND_LABEL, kindOf, type JsonValue } from "@/core/json/value";
import { decodeStringJson, type StringJsonLimits } from "@/core/parsing/string-json";

/** 문자열 JSON을 해석하는 경로 단계 */
export interface DecodeStep {
  decode: "json";
}

/**
 * 내부 경로 표현. 점·대괄호가 든 실제 키도 문자열 토큰 하나로 다루므로 오해석이 없다.
 * - string: 객체 키
 * - number: 배열 인덱스
 * - { decode: "json" }: 현재 값이 문자열 JSON이면 해석(이미 객체·배열이면 그대로)
 */
export type PathStep = string | number | DecodeStep;
export type Path = PathStep[];

export function isDecodeStep(step: PathStep): step is DecodeStep {
  return typeof step === "object";
}

const BARE_KEY = /^[A-Za-z_$가-힣][\w$가-힣]*$/;

/** 사람이 읽는 경로: payload(JSON).items[0]["a.b"] */
export function formatPath(path: Path): string {
  let out = "";
  for (const step of path) {
    if (isDecodeStep(step)) out += "(JSON)";
    else if (typeof step === "number") out += `[${step}]`;
    else if (BARE_KEY.test(step)) out += out === "" ? step : `.${step}`;
    else out += `[${JSON.stringify(step)}]`;
  }
  return out === "" ? "(레코드)" : out;
}

export type Resolution =
  | { kind: "value"; value: JsonValue }
  | { kind: "missing" }
  | { kind: "error"; failure: ValueFailure };

/**
 * 경로를 따라 값을 찾는다.
 * - 키·인덱스가 없거나 중간 값이 null이면 missing.
 * - 객체가 아닌 값에 키로 접근하는 등 구조가 맞지 않으면 error(PATH_TYPE_MISMATCH).
 * - decode 단계: 문자열이면 해석, 객체·배열이면 그대로, null이면 null 유지.
 */
export function resolvePath(root: JsonValue, path: Path, limits: StringJsonLimits, basePath: Path = []): Resolution {
  let current: JsonValue = root;
  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    const kind = kindOf(current);
    const at = () => formatPath([...basePath, ...path.slice(0, i + 1)]);

    if (isDecodeStep(step)) {
      if (kind === "object" || kind === "array" || kind === "null") continue;
      if (kind !== "string") {
        return { kind: "error", failure: fail("PATH_TYPE_MISMATCH", `${KIND_LABEL[kind]} 값은 문자열 JSON으로 해석할 수 없습니다.`, at()) };
      }
      const decoded = decodeStringJson(current as string, limits);
      if (!decoded.ok) return { kind: "error", failure: fail(decoded.code, decoded.message, at()) };
      current = decoded.value;
      continue;
    }

    if (kind === "null") return { kind: "missing" };

    if (typeof step === "number") {
      if (kind !== "array") {
        return { kind: "error", failure: fail("PATH_TYPE_MISMATCH", `${KIND_LABEL[kind]} 값에 배열 인덱스로 접근했습니다.`, at()) };
      }
      const array = current as JsonValue[];
      if (step >= array.length) return { kind: "missing" };
      current = array[step];
      continue;
    }

    if (kind !== "object") {
      return { kind: "error", failure: fail("PATH_TYPE_MISMATCH", `${KIND_LABEL[kind]} 값에 키로 접근했습니다.`, at()) };
    }
    const found = getOwn(current as Record<string, JsonValue>, step);
    if (!found.found) return { kind: "missing" };
    current = found.value;
  }
  return { kind: "value", value: current };
}
