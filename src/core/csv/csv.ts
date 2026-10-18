import type { CsvOptions } from "@/core/mapping/config";
import type { ColumnType } from "@/schemas/output-schema";

export const UTF8_BOM = "﻿";

// 스프레드시트가 수식으로 해석할 수 있는 시작 문자
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * 수식 위험값 정책. escape이면 문자열 컬럼 값 앞에 '를 붙인다.
 * 숫자 컬럼(integer/decimal)은 형식 검증을 통과한 값만 오므로 음수를 바꾸지 않는다.
 * 원문이 바뀌는 정책이므로(예: "+82-10..." → "'+82-10...") README에 영향을 설명한다.
 */
export function applyFormulaPolicy(text: string, type: ColumnType, policy: CsvOptions["formulaPolicy"]): string {
  if (policy === "keep" || type === "integer" || type === "decimal") return text;
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/** RFC 4180: 구분자·따옴표·줄바꿈이 있으면 따옴표로 감싸고 내부 따옴표는 두 번 쓴다. */
export function escapeCsvField(field: string, delimiter: string): string {
  if (field.includes(delimiter) || field.includes('"') || field.includes("\n") || field.includes("\r")) {
    return `"${field.replaceAll('"', '""')}"`;
  }
  return field;
}

export function lineBreak(options: CsvOptions): string {
  return options.lineEnding === "CRLF" ? "\r\n" : "\n";
}

/** 한 행(줄바꿈 포함). 스트리밍 출력에서도 같은 함수를 쓴다. */
export function formatCsvRow(fields: string[], options: CsvOptions): string {
  return fields.map((field) => escapeCsvField(field, options.delimiter)).join(options.delimiter) + lineBreak(options);
}

/** 파일 시작 부분: BOM(선택) + 헤더 행 */
export function csvPreamble(headers: string[], options: CsvOptions): string {
  return (options.bom ? UTF8_BOM : "") + formatCsvRow(headers, options);
}

export function serializeCsv(headers: string[], rows: string[][], options: CsvOptions): string {
  let out = csvPreamble(headers, options);
  for (const row of rows) out += formatCsvRow(row, options);
  return out;
}
