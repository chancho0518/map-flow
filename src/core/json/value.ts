/**
 * 정규화된 JSON 값 표현.
 * 숫자는 JS Number로 바꾸지 않고 원문 그대로(JsonNumber.raw) 보존해
 * 큰 정수와 소수의 정밀도 손실을 막는다.
 */
export class JsonNumber {
  constructor(readonly raw: string) {}
}

export type JsonScalar = string | boolean | JsonNumber;
export type JsonValue = null | JsonScalar | JsonValue[] | JsonObject;
/** 키 조회는 반드시 getOwn()을 사용한다(프로토타입 체인 조회 금지). */
export type JsonObject = { [key: string]: JsonValue };

export type JsonKind = "null" | "string" | "number" | "boolean" | "array" | "object";

export function kindOf(value: JsonValue): JsonKind {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  if (value instanceof JsonNumber) return "number";
  if (Array.isArray(value)) return "array";
  return "object";
}

export function isJsonObject(value: JsonValue): value is JsonObject {
  return kindOf(value) === "object";
}

export function isScalar(value: JsonValue): value is JsonScalar {
  const kind = kindOf(value);
  return kind === "string" || kind === "number" || kind === "boolean";
}

/** 자기 소유 속성만 조회한다. "__proto__", "constructor" 같은 키도 일반 키로 취급한다. */
export function getOwn(object: JsonObject, key: string): { found: true; value: JsonValue } | { found: false } {
  return Object.hasOwn(object, key) ? { found: true, value: object[key] } : { found: false };
}

/** 비교·코드 치환용 표준 텍스트. 숫자는 원문, 불리언은 "true"/"false". */
export function scalarText(value: JsonScalar): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  return value.raw;
}

/** 오류 메시지용 종류 이름 */
export const KIND_LABEL: Record<JsonKind, string> = {
  null: "null",
  string: "문자열",
  number: "숫자",
  boolean: "참/거짓",
  array: "배열",
  object: "객체",
};
