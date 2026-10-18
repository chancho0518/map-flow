import { fail, type ValueFailure } from "@/core/errors/errors";
import { scalarText, type JsonScalar } from "@/core/json/value";
import type { Step } from "@/core/mapping/config";
import { parseDateOnly, parseTimestampToDate } from "./date";

export type StepResult = { ok: true; value: JsonScalar } | { ok: false; failure: ValueFailure };

/** 등록된 변환만 순서대로 실행한다. 임의 코드 실행은 지원하지 않는다. */
export function runSteps(input: JsonScalar, steps: Step[]): StepResult {
  let value = input;
  for (const step of steps) {
    const result = runStep(value, step);
    if (!result.ok) return result;
    value = result.value;
  }
  return { ok: true, value };
}

function runStep(value: JsonScalar, step: Step): StepResult {
  switch (step.op) {
    case "trim":
      return { ok: true, value: typeof value === "string" ? value.trim() : value };

    case "mapCode": {
      const key = scalarText(value);
      const entry = step.entries.find((candidate) => candidate.from === key);
      if (entry) return { ok: true, value: entry.to };
      if (step.onUnknown === "keep") return { ok: true, value };
      if (step.onUnknown === "blank") return { ok: true, value: "" };
      return { ok: false, failure: fail("CODE_UNKNOWN", "코드 치환 표에 없는 값입니다.") };
    }

    case "date": {
      if (typeof value === "boolean") {
        return { ok: false, failure: fail("DATE_INVALID", "참/거짓 값은 날짜로 바꿀 수 없습니다.") };
      }
      // YYYYMMDD가 JSON 숫자로 온 경우를 위해 숫자는 원문 텍스트로 읽는다.
      const text = scalarText(value);
      const result =
        step.input.kind === "date"
          ? parseDateOnly(text, step.input.format)
          : parseTimestampToDate(text, step.outputOffset, step.input.assumeOffset);
      return result.ok ? { ok: true, value: result.date } : result;
    }

    case "boolean": {
      if (typeof value === "boolean") return { ok: true, value };
      const text = scalarText(value);
      if (step.trueValues.includes(text)) return { ok: true, value: true };
      if (step.falseValues.includes(text)) return { ok: true, value: false };
      return { ok: false, failure: fail("BOOLEAN_INVALID", "참/거짓 값 목록에 없는 값입니다.") };
    }
  }
}
