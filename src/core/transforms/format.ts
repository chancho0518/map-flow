import { fail, type ValueFailure } from "@/core/errors/errors";
import { scalarText, type JsonScalar } from "@/core/json/value";
import type { BooleanOutputFormat, DateOutputFormat, OutputColumn } from "@/schemas/output-schema";
import { formatIsoDate, isIsoDate } from "./date";

export type FormatResult = { ok: true; text: string } | { ok: false; failure: ValueFailure };

const INTEGER = /^[+-]?\d+$/;
const DECIMAL = /^[+-]?\d+(\.\d+)?$/;

const BOOLEAN_TEXT: Record<BooleanOutputFormat, [string, string]> = {
  "Y/N": ["Y", "N"],
  "true/false": ["true", "false"],
  "1/0": ["1", "0"],
};

/**
 * 출력 컬럼 타입에 맞춰 최종 셀 텍스트를 만든다.
 * 값을 계산하거나 다시 쓰지 않는다: 정수·소수는 원문 그대로 검증만 하고(앞자리 0 유지),
 * 지수 표기 등 형식이 맞지 않으면 오류를 낸다.
 */
export function formatCellValue(value: JsonScalar, column: OutputColumn): FormatResult {
  const result = formatByType(value, column);
  if (result.ok && column.allowedValues && result.text !== "" && !column.allowedValues.includes(result.text)) {
    return { ok: false, failure: fail("VALUE_NOT_ALLOWED", `허용 값(${column.allowedValues.join(", ")})이 아닙니다.`) };
  }
  return result;
}

function formatByType(value: JsonScalar, column: OutputColumn): FormatResult {
  switch (column.type) {
    case "string":
      if (typeof value === "boolean") return mismatch("참/거짓 값을 문자열 컬럼에 쓰려면 코드 치환을 설정하세요.");
      return { ok: true, text: scalarText(value) };

    case "integer":
    case "decimal": {
      if (typeof value === "boolean") return mismatch("참/거짓 값은 숫자 컬럼에 쓸 수 없습니다.");
      const text = scalarText(value);
      const integer = column.type === "integer";
      if (!(integer ? INTEGER : DECIMAL).test(text)) {
        return {
          ok: false,
          failure: integer
            ? fail("INTEGER_INVALID", "정수 형식이 아닙니다.")
            : fail("DECIMAL_INVALID", "소수 형식이 아닙니다(지수 표기 불가)."),
        };
      }
      return { ok: true, text };
    }

    case "date": {
      if (typeof value !== "string" || !isIsoDate(value)) {
        return { ok: false, failure: fail("DATE_INVALID", "YYYY-MM-DD 날짜가 아닙니다. 날짜 변환 단계를 설정하세요.") };
      }
      return { ok: true, text: formatIsoDate(value, (column.format ?? "YYYY-MM-DD") as DateOutputFormat) };
    }

    case "boolean": {
      if (typeof value !== "boolean") {
        return { ok: false, failure: fail("BOOLEAN_INVALID", "참/거짓 값이 아닙니다. 참/거짓 변환 단계를 설정하세요.") };
      }
      const [yes, no] = BOOLEAN_TEXT[(column.format ?? "true/false") as BooleanOutputFormat];
      return { ok: true, text: value ? yes : no };
    }
  }
}

/**
 * 설정에 문자열로 적힌 기본값·고정값을 컬럼 타입의 값으로 읽는다.
 * boolean 컬럼에서만 "true"/"false"를 참/거짓으로 받는다(원본 데이터에는 적용하지 않음).
 */
export function configValueToScalar(value: string, column: OutputColumn): JsonScalar {
  if (column.type === "boolean" && (value === "true" || value === "false")) return value === "true";
  return value;
}

function mismatch(message: string): FormatResult {
  return { ok: false, failure: fail("TYPE_MISMATCH", message) };
}
