import { kindOf, type JsonValue } from "@/core/json/value";
import { parseJsonText } from "./parse-json";

export interface StringJsonLimits {
  /** 이중 인코딩을 몇 단계까지 풀지(1 = 한 번만 파싱) */
  maxDepth: number;
  /** 해석할 단일 문자열의 최대 길이(문자 수) */
  maxStringLength: number;
}

export const DEFAULT_STRING_JSON_LIMITS: StringJsonLimits = {
  maxDepth: 2,
  maxStringLength: 1_000_000,
};

export type DecodeResult =
  | { ok: true; value: JsonValue }
  | { ok: false; code: "STRING_JSON_INVALID" | "STRING_JSON_TOO_LARGE" | "STRING_JSON_TOO_DEEP"; message: string };

/** 문자열 JSON처럼 보이는지(객체·배열 또는 이중 인코딩된 문자열) */
export function looksLikeStringJson(text: string): boolean {
  const first = text.trimStart()[0];
  return first === "{" || first === "[";
}

/**
 * 문자열 안에 든 JSON 객체·배열을 해석한다.
 * 숫자·true/false처럼 보이는 문자열은 해석하지 않는다(임의 타입 변환 금지).
 * 결과가 다시 JSON 문자열이면(이중 인코딩) maxDepth까지 반복한다.
 */
export function decodeStringJson(text: string, limits: StringJsonLimits): DecodeResult {
  let current = text;
  for (let depth = 1; depth <= limits.maxDepth; depth++) {
    if (current.length > limits.maxStringLength) {
      return {
        ok: false,
        code: "STRING_JSON_TOO_LARGE",
        message: `문자열 JSON 길이(${current.length}자)가 제한(${limits.maxStringLength}자)을 넘습니다.`,
      };
    }
    const first = current.trimStart()[0];
    if (first !== "{" && first !== "[" && first !== '"') {
      return { ok: false, code: "STRING_JSON_INVALID", message: "JSON 객체·배열 형태의 문자열이 아닙니다." };
    }
    const parsed = parseJsonText(current);
    if (!parsed.ok) {
      return { ok: false, code: "STRING_JSON_INVALID", message: `문자열 JSON 파싱 실패: ${parsed.message}` };
    }
    const kind = kindOf(parsed.value);
    if (kind === "object" || kind === "array") return { ok: true, value: parsed.value };
    if (kind !== "string") {
      return { ok: false, code: "STRING_JSON_INVALID", message: "문자열 JSON의 결과가 객체·배열이 아닙니다." };
    }
    current = parsed.value as string;
  }
  return {
    ok: false,
    code: "STRING_JSON_TOO_DEEP",
    message: `문자열 JSON 중첩 인코딩이 허용 깊이(${limits.maxDepth})를 넘습니다.`,
  };
}
