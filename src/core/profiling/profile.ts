import { kindOf, scalarText, type JsonKind, type JsonValue } from "@/core/json/value";
import { decodeStringJson, looksLikeStringJson, type StringJsonLimits } from "@/core/parsing/string-json";
import { formatPath, type PathStep } from "@/core/paths/path";

/** 프로파일 경로: 실행 경로 단계 + 배열 항목 전체를 뜻하는 "each" */
export type ProfileStep = PathStep | { each: true };

export interface FieldProfile {
  path: ProfileStep[];
  display: string;
  /** 관찰된 종류별 건수 */
  kinds: Partial<Record<JsonKind, number>>;
  /** 이 필드가 있었던 레코드 수 */
  presentIn: number;
  /** 분석한 레코드 중 이 필드가 없던 레코드 수 */
  missingIn: number;
  /** 최대 3개, 각 40자 이내로 자른 예시 */
  samples: string[];
  /** 문자열 JSON을 해석해서 얻은 경로인지 */
  fromStringJson: boolean;
  /** 이 경로의 문자열이 JSON처럼 보이지만 해석에 실패한 건수 */
  stringJsonFailures: number;
}

export interface ProfileResult {
  /** 분석에 사용한 레코드 수(전체 건수가 아님) */
  sampledRecords: number;
  fields: FieldProfile[];
}

const SAMPLE_COUNT = 3;
const SAMPLE_LENGTH = 40;

function displayProfilePath(path: ProfileStep[]): string {
  let out = "";
  let segment: PathStep[] = [];
  const flush = () => {
    if (segment.length > 0) {
      const text = formatPath(segment);
      out += out === "" || text.startsWith("[") || text.startsWith("(") ? text : `.${text}`;
      segment = [];
    }
  };
  for (const step of path) {
    if (typeof step === "object" && "each" in step) {
      flush();
      out += "[*]";
    } else {
      segment.push(step);
    }
  }
  flush();
  return out === "" ? "(레코드)" : out;
}

/**
 * 샘플 레코드의 필드 구조를 요약한다. 문자열 JSON은 해석해서 내부 필드도 후보로 보여주고,
 * 해석 실패는 건수로만 기록한다(원본 값은 짧게 자른 예시만 보관).
 * 샘플에 없던 변형은 전체 변환 중 레코드별 검증에서 드러난다.
 */
export function profileRecords(records: JsonValue[], limits: StringJsonLimits, maxDepth = 8): ProfileResult {
  const fields = new Map<string, FieldProfile & { seenIn: Set<number> }>();

  const touch = (path: ProfileStep[], fromStringJson: boolean, recordIndex: number) => {
    const key = JSON.stringify(path);
    let field = fields.get(key);
    if (!field) {
      field = {
        path,
        display: displayProfilePath(path),
        kinds: {},
        presentIn: 0,
        missingIn: 0,
        samples: [],
        fromStringJson,
        stringJsonFailures: 0,
        seenIn: new Set(),
      };
      fields.set(key, field);
    }
    field.seenIn.add(recordIndex);
    return field;
  };

  const visit = (value: JsonValue, path: ProfileStep[], fromStringJson: boolean, recordIndex: number, depth: number) => {
    const kind = kindOf(value);
    if (path.length > 0) {
      const field = touch(path, fromStringJson, recordIndex);
      field.kinds[kind] = (field.kinds[kind] ?? 0) + 1;
      if ((kind === "string" || kind === "number" || kind === "boolean") && field.samples.length < SAMPLE_COUNT) {
        const text = scalarText(value as string);
        field.samples.push(text.length > SAMPLE_LENGTH ? `${text.slice(0, SAMPLE_LENGTH)}…` : text);
      }
      if (kind === "string" && looksLikeStringJson(value as string)) {
        const decoded = decodeStringJson(value as string, limits);
        if (decoded.ok) visit(decoded.value, [...path, { decode: "json" }], true, recordIndex, depth + 1);
        else field.stringJsonFailures++;
        return;
      }
    }
    if (depth >= maxDepth) return;
    if (kind === "object") {
      const object = value as Record<string, JsonValue>;
      for (const key of Object.keys(object)) visit(object[key], [...path, key], fromStringJson, recordIndex, depth + 1);
    } else if (kind === "array") {
      for (const item of value as JsonValue[]) visit(item, [...path, { each: true }], fromStringJson, recordIndex, depth + 1);
    }
  };

  records.forEach((record, index) => visit(record, [], false, index, 0));

  const result: FieldProfile[] = [];
  for (const { seenIn, ...field } of fields.values()) {
    field.presentIn = seenIn.size;
    field.missingIn = records.length - seenIn.size;
    result.push(field);
  }
  return { sampledRecords: records.length, fields: result };
}
