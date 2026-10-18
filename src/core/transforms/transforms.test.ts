import { describe, expect, it } from "vitest";
import { JsonNumber } from "@/core/json/value";
import type { OutputColumn } from "@/schemas/output-schema";
import { parseDateOnly, parseTimestampToDate } from "./date";
import { configValueToScalar, formatCellValue } from "./format";
import { runSteps } from "./steps";

describe("날짜", () => {
  it("실제 달력 유효성을 검사한다", () => {
    expect(parseDateOnly("2024-02-29", "YYYY-MM-DD")).toEqual({ ok: true, date: "2024-02-29" });
    expect(parseDateOnly("2025-02-29", "YYYY-MM-DD")).toMatchObject({ ok: false, failure: { code: "DATE_INVALID" } });
    expect(parseDateOnly("2026-02-30", "YYYY-MM-DD")).toMatchObject({ ok: false, failure: { code: "DATE_INVALID" } });
    expect(parseDateOnly("2026-13-01", "YYYY-MM-DD").ok).toBe(false);
    expect(parseDateOnly("2026-3-1", "YYYY-MM-DD").ok).toBe(false);
    expect(parseDateOnly("20260301", "YYYYMMDD")).toEqual({ ok: true, date: "2026-03-01" });
  });

  it("날짜만 있는 값과 시각 값을 섞어 처리하지 않는다", () => {
    expect(parseDateOnly("2026-03-01T00:00:00Z", "YYYY-MM-DD")).toMatchObject({ failure: { code: "DATE_KIND_MISMATCH" } });
    expect(parseTimestampToDate("2026-03-01", "+09:00")).toMatchObject({ failure: { code: "DATE_KIND_MISMATCH" } });
  });

  it("시각은 오프셋을 반영해 출력 시간대의 날짜로 바꾼다", () => {
    expect(parseTimestampToDate("2025-03-01T15:30:00Z", "+09:00")).toEqual({ ok: true, date: "2025-03-02" });
    expect(parseTimestampToDate("2025-03-01T14:59:59Z", "+09:00")).toEqual({ ok: true, date: "2025-03-01" });
    expect(parseTimestampToDate("2025-02-28T23:59:59-05:00", "+09:00")).toEqual({ ok: true, date: "2025-03-01" });
    expect(parseTimestampToDate("2025-03-02T01:00:00+09:00", "+00:00")).toEqual({ ok: true, date: "2025-03-01" });
    expect(parseTimestampToDate("2024-12-31T23:30:00.123+0000", "+09:00")).toEqual({ ok: true, date: "2025-01-01" });
  });

  it("오프셋 없는 시각은 가정 시간대가 없으면 오류", () => {
    expect(parseTimestampToDate("2025-03-01T15:30:00", "+09:00")).toMatchObject({ failure: { code: "TIMESTAMP_NO_OFFSET" } });
    expect(parseTimestampToDate("2025-03-01T15:30:00", "+09:00", "+09:00")).toEqual({ ok: true, date: "2025-03-01" });
  });

  it("존재하지 않는 시각은 오류", () => {
    expect(parseTimestampToDate("2025-02-29T10:00:00Z", "+09:00").ok).toBe(false);
    expect(parseTimestampToDate("2025-03-01T24:00:00Z", "+09:00").ok).toBe(false);
  });
});

const col = (partial: Partial<OutputColumn>): OutputColumn => ({
  id: "x",
  header: "X",
  description: "",
  type: "string",
  required: false,
  aliases: [],
  ...partial,
});

describe("출력 형식", () => {
  it("문자열 컬럼: 앞자리 0과 큰 정수 원문을 유지한다", () => {
    expect(formatCellValue("00123", col({}))).toEqual({ ok: true, text: "00123" });
    expect(formatCellValue(new JsonNumber("12345678901234567890123"), col({}))).toEqual({
      ok: true,
      text: "12345678901234567890123",
    });
    expect(formatCellValue(true, col({}))).toMatchObject({ ok: false, failure: { code: "TYPE_MISMATCH" } });
  });

  it("정수 컬럼: 값을 다시 계산하지 않고 형식만 검증한다", () => {
    const integer = col({ type: "integer" });
    expect(formatCellValue(new JsonNumber("0"), integer)).toEqual({ ok: true, text: "0" });
    expect(formatCellValue("007", integer)).toEqual({ ok: true, text: "007" });
    expect(formatCellValue(new JsonNumber("1e3"), integer)).toMatchObject({ failure: { code: "INTEGER_INVALID" } });
    expect(formatCellValue(new JsonNumber("1.5"), integer)).toMatchObject({ failure: { code: "INTEGER_INVALID" } });
    expect(formatCellValue("1,500", integer)).toMatchObject({ failure: { code: "INTEGER_INVALID" } });
  });

  it("소수 컬럼", () => {
    const decimal = col({ type: "decimal" });
    expect(formatCellValue(new JsonNumber("0.10000000000000000001"), decimal)).toEqual({
      ok: true,
      text: "0.10000000000000000001",
    });
    expect(formatCellValue(new JsonNumber("2E-3"), decimal)).toMatchObject({ failure: { code: "DECIMAL_INVALID" } });
  });

  it("참/거짓 컬럼: JSON 불리언만 받고 문자열 'true'는 변환 단계 없이 받지 않는다", () => {
    const bool = col({ type: "boolean", format: "Y/N" });
    expect(formatCellValue(false, bool)).toEqual({ ok: true, text: "N" });
    expect(formatCellValue("true", bool)).toMatchObject({ failure: { code: "BOOLEAN_INVALID" } });
    expect(formatCellValue(configValueToScalar("true", bool), bool)).toEqual({ ok: true, text: "Y" });
  });

  it("날짜 컬럼 출력 형식과 허용 값", () => {
    expect(formatCellValue("2026-03-01", col({ type: "date", format: "YYYYMMDD" }))).toEqual({ ok: true, text: "20260301" });
    expect(formatCellValue("2026-02-30", col({ type: "date" }))).toMatchObject({ failure: { code: "DATE_INVALID" } });
    expect(formatCellValue("골드", col({ allowedValues: ["일반", "VIP"] }))).toMatchObject({
      failure: { code: "VALUE_NOT_ALLOWED" },
    });
  });
});

describe("변환 단계", () => {
  it("코드 치환: 미정의 값 정책", () => {
    const entries = [{ from: "1", to: "일반" }];
    expect(runSteps(new JsonNumber("1"), [{ op: "mapCode", entries, onUnknown: "error" }])).toEqual({ ok: true, value: "일반" });
    expect(runSteps("9", [{ op: "mapCode", entries, onUnknown: "keep" }])).toEqual({ ok: true, value: "9" });
    expect(runSteps("9", [{ op: "mapCode", entries, onUnknown: "blank" }])).toEqual({ ok: true, value: "" });
    expect(runSteps("9", [{ op: "mapCode", entries, onUnknown: "error" }])).toMatchObject({ failure: { code: "CODE_UNKNOWN" } });
  });

  it("단계는 순서대로 실행된다(trim 후 치환)", () => {
    const steps = [{ op: "trim" as const }, { op: "mapCode" as const, entries: [{ from: "A", to: "VIP" }], onUnknown: "error" as const }];
    expect(runSteps("  A ", steps)).toEqual({ ok: true, value: "VIP" });
  });

  it("참/거짓 변환은 명시한 목록만 받는다", () => {
    const step = { op: "boolean" as const, trueValues: ["Y", "1"], falseValues: ["N", "0"] };
    expect(runSteps(new JsonNumber("1"), [step])).toEqual({ ok: true, value: true });
    expect(runSteps("N", [step])).toEqual({ ok: true, value: false });
    expect(runSteps("yes", [step])).toMatchObject({ failure: { code: "BOOLEAN_INVALID" } });
  });

  it("숫자로 온 YYYYMMDD 날짜도 원문 자릿수로 읽는다", () => {
    expect(
      runSteps(new JsonNumber("20240229"), [{ op: "date", input: { kind: "date", format: "YYYYMMDD" }, outputOffset: "+09:00" }]),
    ).toEqual({ ok: true, value: "2024-02-29" });
  });
});
