import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UTF8_BOM } from "@/core/csv/csv";
import { compileMapping, convertDocument } from "@/core/engine/convert";
import { MappingConfigSchema, type MappingConfig } from "@/core/mapping/config";
import { isRunnable, parseMappingConfig } from "@/core/mapping/validate";
import { demoSchema } from "@/schemas/load";

const FIXTURES = ["a-basic", "b-string-json", "c-edge-keys", "d-arrays-csv"] as const;

function read(fixture: string, file: string): string {
  return readFileSync(fileURLToPath(new URL(`./${fixture}/${file}`, import.meta.url)), "utf8");
}

/**
 * 기대 CSV 파일(LF 저장)을 실제 출력 바이트로 바꾼다:
 * 따옴표 밖의 줄바꿈만 CRLF로 바꾸고(셀 안 줄바꿈은 원본 그대로), BOM을 붙인다.
 */
function expectedCsvBytes(text: string): string {
  let out = "";
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    out += char === "\n" && !quoted ? "\r\n" : char;
  }
  return UTF8_BOM + out;
}

function loadMapping(fixture: string): MappingConfig {
  const parsed = parseMappingConfig(JSON.parse(read(fixture, "mapping.json")), demoSchema);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues, null, 2));
  return parsed.config;
}

describe.each(FIXTURES)("fixture %s", (fixture) => {
  const config = loadMapping(fixture);
  const expected = JSON.parse(read(fixture, "expected.json"));

  it("매핑 설정이 구조·의미 검증을 통과하고 사용 가능 상태다", () => {
    const parsed = parseMappingConfig(JSON.parse(read(fixture, "mapping.json")), demoSchema);
    expect(parsed.ok && isRunnable(parsed.issues)).toBe(true);
  });

  it("기대 CSV와 바이트 단위로 일치한다", () => {
    const compiled = compileMapping(config, demoSchema);
    if (!compiled.ok) throw new Error("compile failed");
    const result = convertDocument(read(fixture, "input.json"), compiled.compiled);

    expect(result.status).toBe(expected.status);
    expect(result.stats).toEqual(expected.stats);
    expect(
      result.errors.map(({ recordIndex, itemIndex, columnId, code }) => ({
        recordIndex,
        ...(itemIndex === undefined ? {} : { itemIndex }),
        columnId,
        code,
      })),
    ).toEqual(expected.errors);
    expect(result.csv).toBe(expectedCsvBytes(read(fixture, "expected.csv")));
  });
});

describe("fixture 공통 검증", () => {
  it("C: __proto__ 키를 일반 키로 읽고 프로토타입을 오염시키지 않는다", () => {
    const compiled = compileMapping(loadMapping("c-edge-keys"), demoSchema);
    if (!compiled.ok) throw new Error("compile failed");
    const result = convertDocument(read("c-edge-keys", "input.json"), compiled.compiled);
    expect(result.rows[0].cells.at(-1)).toBe("yes");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("D: strict 모드에서는 오류가 있으면 성공 CSV를 만들지 않는다", () => {
    const config = { ...loadMapping("d-arrays-csv"), errorMode: "strict" as const };
    const compiled = compileMapping(config, demoSchema);
    if (!compiled.ok) throw new Error("compile failed");
    const result = convertDocument(read("d-arrays-csv", "input.json"), compiled.compiled);
    expect(result.status).toBe("failed");
    expect(result.csv).toBeNull();
    expect(result.stats.failedRows).toBe(2);
  });

  it("미리보기(레코드 일부)와 전체 변환이 같은 규칙으로 같은 행을 만든다", () => {
    const compiled = compileMapping(loadMapping("d-arrays-csv"), demoSchema);
    if (!compiled.ok) throw new Error("compile failed");
    const full = convertDocument(read("d-arrays-csv", "input.json"), compiled.compiled);
    const input = JSON.parse(read("d-arrays-csv", "input.json"));
    const sample = convertDocument(JSON.stringify({ customers: input.customers.slice(0, 1) }), compiled.compiled);
    expect(sample.rows).toEqual(full.rows.filter((row) => row.recordIndex === 0));
  });

  it("모든 fixture 매핑이 Zod 스키마 그대로 다시 직렬화될 수 있다(내보내기 왕복)", () => {
    for (const fixture of FIXTURES) {
      const config = loadMapping(fixture);
      expect(MappingConfigSchema.parse(JSON.parse(JSON.stringify(config)))).toEqual(config);
    }
  });
});
