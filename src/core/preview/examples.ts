import { resolveSource } from "@/core/engine/source";
import { isScalar, KIND_LABEL, kindOf, scalarText, type JsonValue } from "@/core/json/value";
import { usesItemScope, type ColumnMapping, type MappingConfig } from "@/core/mapping/config";
import { resolvePath, type Path } from "@/core/paths/path";

export type ExampleKind = "value" | "missing" | "null" | "empty" | "structured" | "error";

/** 원본 예시 하나. text는 화면 표시용이며 CSV에 쓰이지 않는다. */
export interface SourceExample {
  recordIndex: number;
  itemIndex?: number;
  kind: ExampleKind;
  text: string;
}

const MAX_TEXT = 60;

function clip(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

/** 컬럼 소스가 샘플 레코드에서 실제로 가리키는 원본 값(변환 전) */
export function sourceExamples(
  mapping: ColumnMapping,
  config: MappingConfig,
  records: JsonValue[],
  limit = 5,
): SourceExample[] {
  const examples: SourceExample[] = [];
  const itemScoped = usesItemScope(mapping.source) && config.explode !== undefined;

  for (let recordIndex = 0; recordIndex < records.length && examples.length < limit; recordIndex++) {
    const record = records[recordIndex];
    let items: { value: JsonValue | undefined; index?: number; base: Path }[] = [{ value: undefined, base: [] }];
    if (itemScoped && config.explode) {
      const resolved = resolvePath(record, config.explode.path, config.stringJson);
      const array = resolved.kind === "value" && Array.isArray(resolved.value) ? resolved.value : [];
      items = array.map((value, index) => ({ value, index, base: [...config.explode!.path, index] }));
    }
    for (const item of items) {
      if (examples.length >= limit) break;
      const value = resolveSource(mapping.source, { record, item: item.value, itemBase: item.base, limits: config.stringJson });
      const position = item.index === undefined ? { recordIndex } : { recordIndex, itemIndex: item.index };
      if (value.state === "error") examples.push({ ...position, kind: "error", text: value.failure.message });
      else if (value.state === "missing") examples.push({ ...position, kind: "missing", text: "누락" });
      else if (value.value === null) examples.push({ ...position, kind: "null", text: "null" });
      else if (value.value === "") examples.push({ ...position, kind: "empty", text: "빈 문자열" });
      else if (isScalar(value.value)) examples.push({ ...position, kind: "value", text: clip(scalarText(value.value)) });
      else examples.push({ ...position, kind: "structured", text: KIND_LABEL[kindOf(value.value)] });
    }
  }
  return examples;
}
