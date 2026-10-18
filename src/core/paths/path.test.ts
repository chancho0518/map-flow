import { describe, expect, it } from "vitest";
import { parseJsonText } from "@/core/parsing/parse-json";
import { DEFAULT_STRING_JSON_LIMITS } from "@/core/parsing/string-json";
import { formatPath, resolvePath } from "./path";

const limits = DEFAULT_STRING_JSON_LIMITS;

function json(text: string) {
  const parsed = parseJsonText(text);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.value;
}

describe("formatPath", () => {
  it("점·대괄호가 든 키는 따옴표로 감싸 구분한다", () => {
    expect(formatPath(["info", "a.b", "full[name]", 0, { decode: "json" }, "x"])).toBe(
      'info["a.b"]["full[name]"][0](JSON).x',
    );
    expect(formatPath(["고객", "이름"])).toBe("고객.이름");
    expect(formatPath([])).toBe("(레코드)");
  });
});

describe("resolvePath", () => {
  const root = json('{"a.b": {"c": 1}, "a": {"b": {"c": 2}}, "n": null, "s": "text", "arr": [10, 20], "j": "{\\"k\\":\\"v\\"}", "o": {"k": "w"}}');

  it("점이 든 키와 중첩 경로를 구분한다", () => {
    expect(resolvePath(root, ["a.b", "c"], limits)).toMatchObject({ kind: "value", value: { raw: "1" } });
    expect(resolvePath(root, ["a", "b", "c"], limits)).toMatchObject({ kind: "value", value: { raw: "2" } });
  });

  it("없는 키는 missing, 중간이 null이어도 missing", () => {
    expect(resolvePath(root, ["zzz"], limits)).toEqual({ kind: "missing" });
    expect(resolvePath(root, ["n", "x"], limits)).toEqual({ kind: "missing" });
    expect(resolvePath(root, ["n"], limits)).toEqual({ kind: "value", value: null });
  });

  it("프로토타입 속성은 찾지 않는다", () => {
    expect(resolvePath(root, ["constructor"], limits)).toEqual({ kind: "missing" });
    expect(resolvePath(root, ["toString"], limits)).toEqual({ kind: "missing" });
  });

  it("구조가 맞지 않으면 PATH_TYPE_MISMATCH", () => {
    expect(resolvePath(root, ["s", "x"], limits)).toMatchObject({ kind: "error", failure: { code: "PATH_TYPE_MISMATCH" } });
    expect(resolvePath(root, ["arr", "x"], limits)).toMatchObject({ kind: "error", failure: { code: "PATH_TYPE_MISMATCH" } });
  });

  it("배열 인덱스와 범위 밖 인덱스", () => {
    expect(resolvePath(root, ["arr", 1], limits)).toMatchObject({ kind: "value", value: { raw: "20" } });
    expect(resolvePath(root, ["arr", 5], limits)).toEqual({ kind: "missing" });
  });

  it("decode 단계: 문자열 JSON은 해석, 이미 객체면 그대로", () => {
    expect(resolvePath(root, ["j", { decode: "json" }, "k"], limits)).toEqual({ kind: "value", value: "v" });
    expect(resolvePath(root, ["o", { decode: "json" }, "k"], limits)).toEqual({ kind: "value", value: "w" });
    expect(resolvePath(root, ["s", { decode: "json" }, "k"], limits)).toMatchObject({
      kind: "error",
      failure: { code: "STRING_JSON_INVALID", path: "s(JSON)" },
    });
  });
});
