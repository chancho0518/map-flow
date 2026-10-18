import { fail, type ValueFailure } from "@/core/errors/errors";
import { KIND_LABEL, isJsonObject, kindOf, type JsonValue } from "@/core/json/value";
import type { MappingConfig } from "@/core/mapping/config";
import type { StringJsonLimits } from "@/core/parsing/string-json";
import { formatPath, resolvePath, type Path } from "@/core/paths/path";

export type RecordSelection = { ok: true; records: JsonValue[] } | { ok: false; failure: ValueFailure };

/** 설정의 레코드 경로로 레코드 목록을 고른다. 경로가 없거나 형태가 다르면 변환을 시작하지 않는다. */
export function selectRecords(root: JsonValue, records: MappingConfig["records"], limits: StringJsonLimits): RecordSelection {
  const where = formatPath(records.path);
  const resolved = resolvePath(root, records.path, limits);
  if (resolved.kind === "error") return { ok: false, failure: resolved.failure };
  if (resolved.kind === "missing") {
    return { ok: false, failure: fail("RECORDS_PATH_NOT_FOUND", "레코드 경로를 찾을 수 없습니다.", where) };
  }
  const kind = kindOf(resolved.value);
  if (records.mode === "single") {
    if (kind !== "object") {
      return { ok: false, failure: fail("RECORD_NOT_OBJECT", `단일 레코드가 객체가 아니라 ${KIND_LABEL[kind]}입니다.`, where) };
    }
    return { ok: true, records: [resolved.value] };
  }
  if (kind !== "array") {
    return { ok: false, failure: fail("RECORDS_NOT_ARRAY", `레코드 경로가 배열이 아니라 ${KIND_LABEL[kind]}입니다.`, where) };
  }
  return { ok: true, records: resolved.value as JsonValue[] };
}

export interface RecordCandidate {
  mode: MappingConfig["records"]["mode"];
  path: Path;
  /** array: 항목 수, single: 1 */
  count: number;
  /** array: 객체인 항목의 수 */
  objectCount: number;
}

/**
 * 레코드 목록 후보를 찾는다: 최상위 배열, 객체 안 배열, 단일 객체.
 * 사용자가 최종 선택하며, 자동으로 확정하지 않는다.
 */
export function findRecordCandidates(root: JsonValue, maxDepth = 4): RecordCandidate[] {
  const candidates: RecordCandidate[] = [];

  const visit = (value: JsonValue, path: Path, depth: number) => {
    if (Array.isArray(value)) {
      const objectCount = value.filter((item) => isJsonObject(item)).length;
      if (objectCount > 0) candidates.push({ mode: "array", path, count: value.length, objectCount });
      return;
    }
    if (!isJsonObject(value) || depth >= maxDepth) return;
    for (const key of Object.keys(value)) visit(value[key], [...path, key], depth + 1);
  };

  visit(root, [], 0);
  candidates.sort((a, b) => b.objectCount - a.objectCount || a.path.length - b.path.length);
  if (isJsonObject(root)) candidates.push({ mode: "single", path: [], count: 1, objectCount: 1 });
  return candidates;
}
