import { describe, expect, it } from "vitest";
import { JsonNumber } from "@/core/json/value";
import { parseJsonText } from "./parse-json";
import { decodeStringJson, DEFAULT_STRING_JSON_LIMITS } from "./string-json";

describe("parseJsonText", () => {
  it("큰 정수와 소수를 원문 그대로 보존한다", () => {
    const result = parseJsonText('{"id": 12345678901234567890123, "rate": 0.10000000000000000001, "e": 1e3}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const value = result.value as Record<string, JsonNumber>;
    expect(value.id.raw).toBe("12345678901234567890123");
    expect(value.rate.raw).toBe("0.10000000000000000001");
    expect(value.e.raw).toBe("1e3");
  });

  it("__proto__ 키를 own property로 저장하고 프로토타입을 바꾸지 않는다", () => {
    const result = parseJsonText('{"__proto__": {"polluted": true}}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.hasOwn(result.value as object, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(result.value)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("값이 다른 중복 키는 오류로 처리한다", () => {
    expect(parseJsonText('{"a": 1, "a": 2}').ok).toBe(false);
  });

  it("끝부분이 깨진 JSON은 실패한다", () => {
    expect(parseJsonText('[{"a": 1}, {"a": 2}').ok).toBe(false);
  });
});

describe("decodeStringJson", () => {
  const limits = DEFAULT_STRING_JSON_LIMITS;

  it("객체·배열 문자열을 해석한다", () => {
    expect(decodeStringJson('{"a":"1"}', limits)).toMatchObject({ ok: true, value: { a: "1" } });
    expect(decodeStringJson("  [1]", limits).ok).toBe(true);
  });

  it("이중 인코딩을 maxDepth까지 해석한다", () => {
    const double = JSON.stringify(JSON.stringify({ a: "x" }));
    expect(decodeStringJson(double, limits)).toMatchObject({ ok: true, value: { a: "x" } });
    expect(decodeStringJson(double, { ...limits, maxDepth: 1 })).toMatchObject({ ok: false, code: "STRING_JSON_TOO_DEEP" });
  });

  it("숫자·불리언처럼 보이는 문자열은 해석하지 않는다", () => {
    expect(decodeStringJson("123", limits)).toMatchObject({ ok: false, code: "STRING_JSON_INVALID" });
    expect(decodeStringJson("true", limits)).toMatchObject({ ok: false, code: "STRING_JSON_INVALID" });
  });

  it("깨진 문자열 JSON은 오류 코드를 낸다", () => {
    expect(decodeStringJson('{"a":', limits)).toMatchObject({ ok: false, code: "STRING_JSON_INVALID" });
  });

  it("크기 제한을 넘으면 해석하지 않는다", () => {
    expect(decodeStringJson('{"a":"long"}', { ...limits, maxStringLength: 5 })).toMatchObject({
      ok: false,
      code: "STRING_JSON_TOO_LARGE",
    });
  });
});
