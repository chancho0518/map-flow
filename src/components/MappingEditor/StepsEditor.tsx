"use client";

import { DATE_INPUT_FORMATS, type Step } from "@/core/mapping/config";
import { STEP_LABEL } from "@/core/preview/describe";
import styles from "./editor.module.css";

function newStep(op: Step["op"]): Step {
  switch (op) {
    case "trim":
      return { op };
    case "mapCode":
      return { op, entries: [{ from: "", to: "" }], onUnknown: "error" };
    case "date":
      return { op, input: { kind: "date", format: "YYYY-MM-DD" }, outputOffset: "+09:00" };
    case "boolean":
      return { op, trueValues: ["Y"], falseValues: ["N"] };
  }
}

const splitList = (text: string) =>
  text
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");

interface Props {
  steps: Step[];
  /** 코드 치환 표 채우기에 쓰는 샘플 원본 값(중복 제거) */
  sampleValues: string[];
  onChange: (steps: Step[]) => void;
}

export function StepsEditor({ steps, sampleValues, onChange }: Props) {
  const replace = (index: number, step: Step) => onChange(steps.map((s, i) => (i === index ? step : s)));
  const move = (index: number, delta: number) => {
    const next = [...steps];
    const [step] = next.splice(index, 1);
    next.splice(index + delta, 0, step);
    onChange(next);
  };

  return (
    <div className={styles.stack}>
      {steps.length === 0 && <p className="muted">변환 단계가 없습니다. 원본 값을 그대로 출력 형식 검증에 넘깁니다.</p>}
      {steps.map((step, index) => (
        <div key={index} className={styles.stepCard}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>
              {index + 1}. {STEP_LABEL[step.op]}
            </strong>
            <div className="row">
              <button type="button" className="btn btn-small" disabled={index === 0} onClick={() => move(index, -1)} aria-label="위로">
                ↑
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={index === steps.length - 1}
                onClick={() => move(index, 1)}
                aria-label="아래로"
              >
                ↓
              </button>
              <button type="button" className="btn btn-small btn-danger" onClick={() => onChange(steps.filter((_, i) => i !== index))}>
                삭제
              </button>
            </div>
          </div>
          <StepBody step={step} sampleValues={sampleValues} onChange={(next) => replace(index, next)} />
        </div>
      ))}
      <label className={styles.inline}>
        단계 추가
        <select
          value=""
          onChange={(event) => {
            if (event.target.value) onChange([...steps, newStep(event.target.value as Step["op"])]);
          }}
        >
          <option value="">선택…</option>
          {(Object.keys(STEP_LABEL) as Step["op"][]).map((op) => (
            <option key={op} value={op}>
              {STEP_LABEL[op]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function StepBody({ step, sampleValues, onChange }: { step: Step; sampleValues: string[]; onChange: (step: Step) => void }) {
  switch (step.op) {
    case "trim":
      return <p className="muted">문자열 앞뒤 공백을 지웁니다. 숫자·참/거짓 값은 바꾸지 않습니다.</p>;

    case "mapCode": {
      const missing = sampleValues.filter((value) => !step.entries.some((entry) => entry.from === value));
      return (
        <div className={styles.stack}>
          <table className={styles.miniTable}>
            <thead>
              <tr>
                <th>원본 값</th>
                <th>바꿀 값</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {step.entries.map((entry, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="text"
                      value={entry.from}
                      onChange={(event) =>
                        onChange({ ...step, entries: step.entries.map((e, j) => (j === i ? { ...e, from: event.target.value } : e)) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={entry.to}
                      onChange={(event) =>
                        onChange({ ...step, entries: step.entries.map((e, j) => (j === i ? { ...e, to: event.target.value } : e)) })
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={step.entries.length <= 1}
                      onClick={() => onChange({ ...step, entries: step.entries.filter((_, j) => j !== i) })}
                    >
                      제거
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button
              type="button"
              className="btn btn-small"
              onClick={() => onChange({ ...step, entries: [...step.entries, { from: "", to: "" }] })}
            >
              행 추가
            </button>
            <button
              type="button"
              className="btn btn-small"
              disabled={missing.length === 0}
              onClick={() =>
                onChange({
                  ...step,
                  entries: [...step.entries.filter((e) => e.from !== "" || e.to !== ""), ...missing.map((from) => ({ from, to: "" }))],
                })
              }
            >
              샘플 값으로 채우기{missing.length > 0 ? ` (${missing.length})` : ""}
            </button>
          </div>
          <p className="muted" style={{ fontSize: "0.8rem" }}>
            숫자는 원문, 참/거짓은 true/false 텍스트로 비교합니다.
          </p>
          <label className={styles.inline}>
            표에 없는 값
            <select
              value={step.onUnknown}
              onChange={(event) => onChange({ ...step, onUnknown: event.target.value as typeof step.onUnknown })}
            >
              <option value="error">오류</option>
              <option value="keep">원본 유지</option>
              <option value="blank">빈칸</option>
            </select>
          </label>
        </div>
      );
    }

    case "date":
      return (
        <div className={styles.stack}>
          <label className={styles.inline}>
            입력 종류
            <select
              value={step.input.kind}
              onChange={(event) =>
                onChange({
                  ...step,
                  input: event.target.value === "date" ? { kind: "date", format: "YYYY-MM-DD" } : { kind: "timestamp" },
                })
              }
            >
              <option value="date">날짜만 (시간대 변환 없음)</option>
              <option value="timestamp">시각 (ISO 8601)</option>
            </select>
          </label>
          {step.input.kind === "date" ? (
            <label className={styles.inline}>
              입력 형식
              <select
                value={step.input.format}
                onChange={(event) =>
                  onChange({ ...step, input: { kind: "date", format: event.target.value as (typeof DATE_INPUT_FORMATS)[number] } })
                }
              >
                {DATE_INPUT_FORMATS.map((format) => (
                  <option key={format}>{format}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className={styles.inline}>
                오프셋 없는 값의 가정 시간대
                <input
                  type="text"
                  placeholder="없음(오류 처리)"
                  value={step.input.assumeOffset ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...step,
                      input: event.target.value === "" ? { kind: "timestamp" } : { kind: "timestamp", assumeOffset: event.target.value },
                    })
                  }
                />
              </label>
              <label className={styles.inline}>
                출력 날짜 기준 시간대
                <input type="text" value={step.outputOffset} onChange={(event) => onChange({ ...step, outputOffset: event.target.value })} />
              </label>
              <p className="muted" style={{ fontSize: "0.8rem" }}>
                시간대는 +09:00 같은 고정 오프셋으로 입력합니다.
              </p>
            </>
          )}
        </div>
      );

    case "boolean":
      return (
        <div className={styles.stack}>
          <label className={styles.inline}>
            참으로 볼 값
            <input
              key={step.trueValues.join("\u0000")}
              type="text"
              defaultValue={step.trueValues.join(", ")}
              onBlur={(event) => onChange({ ...step, trueValues: splitList(event.target.value) })}
            />
          </label>
          <label className={styles.inline}>
            거짓으로 볼 값
            <input
              key={step.falseValues.join("\u0000")}
              type="text"
              defaultValue={step.falseValues.join(", ")}
              onBlur={(event) => onChange({ ...step, falseValues: splitList(event.target.value) })}
            />
          </label>
          <p className="muted" style={{ fontSize: "0.8rem" }}>
            쉼표로 구분합니다. JSON true/false는 그대로 통과하고, 목록에 없는 값은 오류입니다.
          </p>
        </div>
      );
  }
}
