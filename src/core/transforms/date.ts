import { fail, type ValueFailure } from "@/core/errors/errors";
import type { DateInputFormat } from "@/core/mapping/config";
import type { DateOutputFormat } from "@/schemas/output-schema";

/** 내부 표준 날짜 표현: YYYY-MM-DD */
export type IsoDate = string;

type DateResult = { ok: true; date: IsoDate } | { ok: false; failure: ValueFailure };

const DATE_PATTERNS: Record<DateInputFormat, RegExp> = {
  "YYYY-MM-DD": /^(\d{4})-(\d{2})-(\d{2})$/,
  YYYYMMDD: /^(\d{4})(\d{2})(\d{2})$/,
  "YYYY/MM/DD": /^(\d{4})\/(\d{2})\/(\d{2})$/,
  "YYYY.MM.DD": /^(\d{4})\.(\d{2})\.(\d{2})$/,
};

// 날짜(+선택적 시각)와 선택적 오프셋. 날짜만 있는 값은 timestamp로 받지 않는다.
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/;

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= days;
}

function iso(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 날짜만 있는 값. 형식 일치와 실제 달력 유효성을 모두 검사한다. 시간대 변환은 하지 않는다. */
export function parseDateOnly(text: string, format: DateInputFormat): DateResult {
  const match = DATE_PATTERNS[format].exec(text);
  if (!match) {
    if (TIMESTAMP_PATTERN.test(text)) {
      return { ok: false, failure: fail("DATE_KIND_MISMATCH", "시각이 포함된 값입니다. 날짜 변환 입력 종류를 '시각'으로 설정하세요.") };
    }
    return { ok: false, failure: fail("DATE_INVALID", `날짜 형식(${format})과 맞지 않습니다.`) };
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (!isValidCalendarDate(year, month, day)) {
    return { ok: false, failure: fail("DATE_INVALID", "존재하지 않는 날짜입니다.") };
  }
  return { ok: true, date: iso(year, month, day) };
}

/** "+09:00" / "+0900" / "Z" → 분 단위 오프셋 */
export function parseOffsetMinutes(offset: string): number {
  if (offset === "Z") return 0;
  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(offset);
  if (!match) throw new Error(`잘못된 오프셋: ${offset}`);
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

/**
 * ISO 8601 시각을 outputOffset 기준 날짜로 바꾼다.
 * 값에 오프셋이 없으면 assumeOffset을 쓰고, 그것도 없으면 오류(임의 시간대 가정 금지).
 */
export function parseTimestampToDate(text: string, outputOffset: string, assumeOffset?: string): DateResult {
  const match = TIMESTAMP_PATTERN.exec(text);
  if (!match) {
    if (DATE_PATTERNS["YYYY-MM-DD"].test(text)) {
      return { ok: false, failure: fail("DATE_KIND_MISMATCH", "시각이 없는 날짜 값입니다. 날짜 변환 입력 종류를 '날짜'로 설정하세요.") };
    }
    return { ok: false, failure: fail("DATE_INVALID", "ISO 8601 시각 형식과 맞지 않습니다.") };
  }
  const [year, month, day, hour, minute] = [1, 2, 3, 4, 5].map((i) => Number(match[i]));
  const second = match[6] === undefined ? 0 : Number(match[6]);
  if (!isValidCalendarDate(year, month, day) || hour > 23 || minute > 59 || second > 59) {
    return { ok: false, failure: fail("DATE_INVALID", "존재하지 않는 날짜 또는 시각입니다.") };
  }
  const offset = match[7] ?? assumeOffset;
  if (offset === undefined) {
    return { ok: false, failure: fail("TIMESTAMP_NO_OFFSET", "시간대 정보가 없는 시각입니다. 가정할 시간대를 설정하세요.") };
  }
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute, second) - parseOffsetMinutes(offset) * 60_000;
  const local = new Date(utcMillis + parseOffsetMinutes(outputOffset) * 60_000);
  return { ok: true, date: iso(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()) };
}

export function isIsoDate(text: string): boolean {
  return parseDateOnly(text, "YYYY-MM-DD").ok;
}

export function formatIsoDate(date: IsoDate, format: DateOutputFormat): string {
  return format === "YYYYMMDD" ? date.replaceAll("-", "") : date;
}
