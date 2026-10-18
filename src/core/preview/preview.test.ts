import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createEmptyConfig } from "@/core/mapping/factory";
import { MappingConfigSchema } from "@/core/mapping/config";
import { demoSchema } from "@/schemas/load";
import { arrayOptionsAt, EACH, optionsAt, recordFieldOptions, scopeBase } from "./fields";
import { sourceExamples } from "./examples";
import { parseSample, sampleRecords } from "./sample";

const read = (name: string, file: string) =>
  readFileSync(fileURLToPath(new URL(`../../fixtures/${name}/${file}`, import.meta.url)), "utf8");

describe("샘플 분석", () => {
  it("빈 설정은 스키마 컬럼 전체가 미연결이고 Zod 검증을 통과한다", () => {
    const config = createEmptyConfig(demoSchema, "id", "새 설정", new Date().toISOString());
    expect(MappingConfigSchema.safeParse(config).success).toBe(true);
    expect(config.columns.every((c) => c.source.kind === "unmapped")).toBe(true);
  });

  it("레코드 경로 선택 후 전체 건수와 분석 건수를 구분한다", () => {
    const parsed = parseSample(read("b-string-json", "input.json"));
    if (!parsed.ok) throw new Error(parsed.message);
    const config = createEmptyConfig(demoSchema, "id", "n", "2026-10-18T00:00:00Z");
    const sample = sampleRecords(parsed.root, { mode: "array", path: ["data", "items"] }, config.stringJson);
    expect(sample).toMatchObject({ ok: true, totalRecords: 5 });
  });

  it("잘못된 레코드 경로는 이유를 알려준다", () => {
    const parsed = parseSample('{"a": 1}');
    if (!parsed.ok) throw new Error(parsed.message);
    const config = createEmptyConfig(demoSchema, "id", "n", "2026-10-18T00:00:00Z");
    expect(sampleRecords(parsed.root, config.records, config.stringJson)).toMatchObject({ ok: false });
  });

  it("깨진 JSON 샘플은 형식 오류", () => {
    expect(parseSample("[{")).toMatchObject({ ok: false });
  });
});

describe("경로 후보", () => {
  const parsed = parseSample(read("d-arrays-csv", "input.json"));
  if (!parsed.ok) throw new Error(parsed.message);
  const config = MappingConfigSchema.parse(JSON.parse(read("d-arrays-csv", "mapping.json")));
  const sample = sampleRecords(parsed.root, config.records, config.stringJson);
  if (!sample.ok) throw new Error(sample.message);

  it("레코드 기준 필드와 배열, 배열 항목 기준 필드를 나눈다", () => {
    const record = recordFieldOptions(sample.profile.fields).map((o) => o.field.display);
    expect(record).toContain("no");
    expect(record).not.toContain("orders[*].sku");
    expect(arrayOptionsAt(sample.profile.fields, []).map((o) => o.path)).toEqual([["contacts"], ["orders"]]);
    expect(optionsAt(sample.profile.fields, ["contacts", EACH]).map((o) => o.path)).toEqual([["type"], ["value"]]);
    expect(optionsAt(sample.profile.fields, scopeBase("item", ["orders"])).map((o) => o.path)).toEqual([["sku"]]);
  });

  it("컬럼 원본 예시: 항목 기준·조건 선택·오류를 표시용으로 요약한다", () => {
    const product = config.columns.find((c) => c.columnId === "productCode")!;
    expect(sourceExamples(product, config, sample.records, 10).map((e) => [e.recordIndex, e.itemIndex, e.text])).toEqual([
      [0, 0, "SKU-1"],
      [0, 1, "SKU-2"],
      [1, 0, "SKU-3"],
      [3, 0, "SKU-4"],
      [3, 1, "null"],
      [3, 2, "SKU-6"],
    ]);
    const phone = config.columns.find((c) => c.columnId === "phone")!;
    expect(sourceExamples(phone, config, sample.records).map((e) => e.kind)).toEqual(["value", "error", "missing", "value"]);
  });
});
