import type { JsonValue } from "@/core/json/value";
import type { MappingConfig } from "@/core/mapping/config";
import { parseJsonText } from "@/core/parsing/parse-json";
import { formatPath } from "@/core/paths/path";
import { profileRecords, type ProfileResult } from "@/core/profiling/profile";
import { findRecordCandidates, selectRecords, type RecordCandidate } from "@/core/records/records";

/** 샘플 파일 크기 상한. 샘플은 메모리에 전부 올려 분석하므로 대용량 파일은 대량 변환에서 처리한다. */
export const MAX_SAMPLE_BYTES = 20 * 1024 * 1024;
/** 필드 프로파일에 쓰는 앞부분 레코드 수 */
export const PROFILE_RECORD_LIMIT = 500;
/** 미리보기 변환에 쓰는 앞부분 레코드 수 */
export const PREVIEW_RECORD_LIMIT = 100;

export type SampleParse =
  | { ok: true; root: JsonValue; candidates: RecordCandidate[] }
  | { ok: false; message: string };

export function parseSample(text: string): SampleParse {
  const parsed = parseJsonText(text);
  if (!parsed.ok) return { ok: false, message: `JSON 형식 오류: ${parsed.message}` };
  return { ok: true, root: parsed.value, candidates: findRecordCandidates(parsed.value) };
}

export type SampleRecords =
  | {
      ok: true;
      /** 샘플 파일 안의 전체 레코드 수 */
      totalRecords: number;
      /** 프로파일에 사용한 앞부분 레코드 */
      records: JsonValue[];
      profile: ProfileResult;
    }
  | { ok: false; message: string };

/**
 * 레코드 경로로 샘플 레코드를 고르고 앞부분을 프로파일한다.
 * 컬럼 매핑과 무관하게 레코드 설정·문자열 JSON 한도가 바뀔 때만 다시 계산하면 된다.
 */
export function sampleRecords(
  root: JsonValue,
  records: MappingConfig["records"],
  limits: MappingConfig["stringJson"],
): SampleRecords {
  const selection = selectRecords(root, records, limits);
  if (!selection.ok) {
    const where = selection.failure.path ?? formatPath(records.path);
    return { ok: false, message: `${selection.failure.message} (${where})` };
  }
  const analyzed = selection.records.slice(0, PROFILE_RECORD_LIMIT);
  return {
    ok: true,
    totalRecords: selection.records.length,
    records: analyzed,
    profile: profileRecords(analyzed, limits),
  };
}
