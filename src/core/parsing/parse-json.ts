import { parse } from "lossless-json";
import { JsonNumber, type JsonValue } from "@/core/json/value";

export type ParseResult = { ok: true; value: JsonValue } | { ok: false; message: string };

/**
 * JSON 텍스트를 정규화 값으로 파싱한다.
 * - 숫자는 JsonNumber(원문 보존)로 만든다.
 * - "__proto__" 키는 lossless-json이 일반 own property로 저장한다.
 * - 같은 객체에 값이 다른 중복 키가 있으면 오류로 처리한다(어느 값을 쓸지 임의로 정하지 않음).
 * eval이나 손상 JSON 복구는 하지 않는다.
 */
export function parseJsonText(text: string): ParseResult {
  try {
    const value = parse(text, null, { parseNumber: (raw) => new JsonNumber(raw) }) as JsonValue;
    return { ok: true, value };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
