import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseJsonText } from "@/core/parsing/parse-json";
import { DEFAULT_STRING_JSON_LIMITS } from "@/core/parsing/string-json";
import { findRecordCandidates, selectRecords } from "@/core/records/records";
import { profileRecords } from "./profile";

function loadFixture(name: string) {
  const text = readFileSync(fileURLToPath(new URL(`../../fixtures/${name}/input.json`, import.meta.url)), "utf8");
  const parsed = parseJsonText(text);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.value;
}

describe("레코드 후보", () => {
  it("객체 안 배열을 후보로 찾고 단일 객체도 후보로 둔다", () => {
    const candidates = findRecordCandidates(loadFixture("b-string-json"));
    expect(candidates[0]).toMatchObject({ mode: "array", path: ["data", "items"], count: 5 });
    expect(candidates.at(-1)).toMatchObject({ mode: "single", path: [] });
  });

  it("최상위 배열", () => {
    expect(findRecordCandidates(loadFixture("a-basic"))[0]).toMatchObject({ mode: "array", path: [], count: 3 });
  });
});

describe("필드 프로파일", () => {
  const root = loadFixture("b-string-json");
  const selection = selectRecords(root, { mode: "array", path: ["data", "items"] }, DEFAULT_STRING_JSON_LIMITS);
  if (!selection.ok) throw new Error("select failed");
  const profile = profileRecords(selection.records, DEFAULT_STRING_JSON_LIMITS);
  const field = (display: string) => profile.fields.find((f) => f.display === display);

  it("분석 건수를 명시한다", () => {
    expect(profile.sampledRecords).toBe(5);
  });

  it("문자열 JSON 안의 필드를 후보로 보여주고 출처를 표시한다", () => {
    expect(field("attrs(JSON).name")).toMatchObject({ fromStringJson: true });
    expect(field("attrs(JSON).contact.mobile")).toMatchObject({ fromStringJson: true, presentIn: 1, missingIn: 4 });
  });

  it("같은 필드의 객체/문자열/null 혼재와 해석 실패를 집계한다", () => {
    expect(field("attrs")).toMatchObject({ kinds: { string: 3, object: 1, null: 1 }, stringJsonFailures: 1 });
    // 직접 객체(레코드 2)와 문자열 JSON(레코드 1, 3)이 같은 경로 후보로 합쳐지지는 않는다.
    expect(field("attrs.name")).toMatchObject({ fromStringJson: false, presentIn: 1 });
  });
});
