import { describe, expect, it } from "vitest";
import type { CsvOptions } from "@/core/mapping/config";
import { applyFormulaPolicy, escapeCsvField, serializeCsv, UTF8_BOM } from "./csv";

const options: CsvOptions = { bom: true, lineEnding: "CRLF", delimiter: ",", formulaPolicy: "escape" };

describe("CSV 직렬화", () => {
  it("쉼표·따옴표·줄바꿈을 RFC 4180 방식으로 이스케이프한다", () => {
    expect(escapeCsvField("a,b", ",")).toBe('"a,b"');
    expect(escapeCsvField('say "hi"', ",")).toBe('"say ""hi"""');
    expect(escapeCsvField("줄\n바꿈", ",")).toBe('"줄\n바꿈"');
    expect(escapeCsvField("cr\rlf", ",")).toBe('"cr\rlf"');
    expect(escapeCsvField("한글 그대로", ",")).toBe("한글 그대로");
    expect(escapeCsvField("", ",")).toBe("");
  });

  it("BOM, CRLF, 구분자 옵션을 따른다", () => {
    expect(serializeCsv(["가", "나"], [["1", "2"]], options)).toBe(`${UTF8_BOM}가,나\r\n1,2\r\n`);
    expect(serializeCsv(["a"], [["x;y"]], { ...options, bom: false, lineEnding: "LF", delimiter: ";" })).toBe('a\n"x;y"\n');
  });

  it("수식 위험값: 문자열 컬럼만 ' 를 붙이고 숫자 컬럼 음수는 바꾸지 않는다", () => {
    for (const value of ["=1+1", "+82-10", "-마이너스", "@SUM", "\tTAB", "\rCR"]) {
      expect(applyFormulaPolicy(value, "string", "escape")).toBe(`'${value}`);
    }
    expect(applyFormulaPolicy("-5", "integer", "escape")).toBe("-5");
    expect(applyFormulaPolicy("=1+1", "string", "keep")).toBe("=1+1");
    expect(applyFormulaPolicy("일반", "string", "escape")).toBe("일반");
  });
});
