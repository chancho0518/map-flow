/**
 * 변환 오류 코드. 사용자 설명(message)은 한국어로 만들고,
 * 원본 레코드 전체나 민감한 값은 메시지에 넣지 않는다.
 */
export const ERROR_CODES = [
  // 파일·레코드 단위
  "JSON_INVALID",
  "RECORDS_PATH_NOT_FOUND",
  "RECORDS_NOT_ARRAY",
  "RECORD_NOT_OBJECT",
  "EXPLODE_NOT_ARRAY",
  "EXPLODE_EMPTY",
  // 경로·문자열 JSON
  "PATH_TYPE_MISMATCH",
  "STRING_JSON_INVALID",
  "STRING_JSON_TOO_LARGE",
  "STRING_JSON_TOO_DEEP",
  // 값 상태
  "VALUE_MISSING",
  "VALUE_NULL",
  "VALUE_EMPTY",
  "STRUCTURED_VALUE",
  "COLUMN_UNMAPPED",
  // 배열 규칙
  "MATCH_NONE",
  "MATCH_AMBIGUOUS",
  "ARRAY_ELEMENT_INVALID",
  // 변환·형식
  "CODE_UNKNOWN",
  "DATE_INVALID",
  "DATE_KIND_MISMATCH",
  "TIMESTAMP_NO_OFFSET",
  "BOOLEAN_INVALID",
  "INTEGER_INVALID",
  "DECIMAL_INVALID",
  "TYPE_MISMATCH",
  "VALUE_NOT_ALLOWED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ConversionError {
  /** 원본 레코드 인덱스(0부터). 파일 단위 오류는 -1 */
  recordIndex: number;
  /** 행 펼치기 배열 항목 인덱스 */
  itemIndex?: number;
  columnId?: string;
  /** 사람이 읽는 입력 경로 */
  path?: string;
  code: ErrorCode;
  message: string;
}

/** 값 하나를 처리하다 생긴 실패(위치 정보는 상위에서 붙인다) */
export interface ValueFailure {
  code: ErrorCode;
  message: string;
  path?: string;
}

export function fail(code: ErrorCode, message: string, path?: string): ValueFailure {
  return path === undefined ? { code, message } : { code, message, path };
}
