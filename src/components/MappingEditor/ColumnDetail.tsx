"use client";

import { useMemo } from "react";
import type { ConversionResult } from "@/core/engine/convert";
import type { JsonValue } from "@/core/json/value";
import type { ColumnMapping, MappingConfig, Policy } from "@/core/mapping/config";
import { sourceExamples } from "@/core/preview/examples";
import type { OutputColumn } from "@/schemas/output-schema";
import { SourceEditor, type FieldContext } from "./SourceEditor";
import { StepsEditor } from "./StepsEditor";
import styles from "./editor.module.css";

interface Props {
  column: OutputColumn;
  columnIndex: number;
  mapping: ColumnMapping;
  config: MappingConfig;
  records: JsonValue[] | null;
  preview: ConversionResult | null;
  ctx: FieldContext;
  onChange: (mapping: ColumnMapping) => void;
}

const POLICY_ROWS: { key: "whenMissing" | "whenNull" | "whenEmpty" | "onError"; label: string; hint: string }[] = [
  { key: "whenMissing", label: "값이 없을 때(누락)", hint: "경로에 키가 없거나 상위 값이 null" },
  { key: "whenNull", label: "null일 때", hint: "값이 JSON null" },
  { key: "whenEmpty", label: "빈 문자열일 때", hint: "원본 또는 변환 결과가 \"\"" },
  { key: "onError", label: "오류일 때", hint: "구조 불일치·문자열 JSON 손상·변환 실패·형식 오류" },
];

export function ColumnDetail({ column, columnIndex, mapping, config, records, preview, ctx, onChange }: Props) {
  const examples = useMemo(() => (records ? sourceExamples(mapping, config, records, 8) : []), [mapping, config, records]);
  const distinctValues = useMemo(() => {
    if (!records) return [];
    const values = sourceExamples(mapping, config, records, 300)
      .filter((example) => example.kind === "value")
      .map((example) => example.text);
    return [...new Set(values)].slice(0, 100);
  }, [mapping, config, records]);

  const results = useMemo(() => {
    if (!preview) return [];
    return preview.rows.slice(0, 8).map((row) => {
      const error = preview.errors.find(
        (e) =>
          e.recordIndex === row.recordIndex &&
          e.columnId === column.id &&
          (e.itemIndex === undefined || e.itemIndex === row.itemIndex),
      );
      return { row, error, value: row.cells[columnIndex] };
    });
  }, [preview, column.id, columnIndex]);

  return (
    <div className={styles.detail}>
      <div>
        <h3 className={styles.detailTitle}>
          {column.header}
          {column.required && <span className={styles.required}>필수</span>}
        </h3>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          {column.description} · 타입 {column.type}
          {column.format ? ` · 형식 ${column.format}` : ""}
          {column.allowedValues ? ` · 허용 값 ${column.allowedValues.join(", ")}` : ""}
        </p>
      </div>

      <section className={styles.detailSection}>
        <h4>원본 예시</h4>
        {!records && <p className="muted">샘플을 불러오면 원본 값을 볼 수 있습니다.</p>}
        {records && examples.length === 0 && <p className="muted">표시할 예시가 없습니다.</p>}
        <ul className={styles.examples}>
          {examples.map((example, i) => (
            <li key={i}>
              <span className="muted">
                #{example.recordIndex + 1}
                {example.itemIndex !== undefined ? `[${example.itemIndex}]` : ""}
              </span>{" "}
              <span className={example.kind === "value" ? styles.exampleValue : example.kind === "error" ? styles.warn : styles.exampleMarker}>
                {example.kind === "value" ? example.text : `(${example.text})`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.detailSection}>
        <h4>입력</h4>
        <SourceEditor source={mapping.source} ctx={ctx} onChange={(source) => onChange({ ...mapping, source })} />
      </section>

      <section className={styles.detailSection}>
        <h4>변환 규칙</h4>
        <StepsEditor steps={mapping.steps} sampleValues={distinctValues} onChange={(steps) => onChange({ ...mapping, steps })} />
      </section>

      <section className={styles.detailSection}>
        <h4>값이 없거나 오류일 때</h4>
        {POLICY_ROWS.map(({ key, label, hint }) => (
          <PolicyRow
            key={key}
            label={label}
            hint={hint}
            policy={mapping[key]}
            required={column.required}
            onChange={(policy) => onChange({ ...mapping, [key]: policy })}
          />
        ))}
        <p className="muted" style={{ fontSize: "0.8rem" }}>
          0과 false는 값으로 취급합니다. 기본값은 변환 규칙을 거치지 않고 출력 형식 검증만 받습니다.
        </p>
      </section>

      <section className={styles.detailSection}>
        <h4>결과 예시</h4>
        {results.length === 0 && <p className="muted">샘플 결과가 없습니다.</p>}
        <ul className={styles.examples}>
          {results.map(({ row, error, value }, i) => (
            <li key={i}>
              <span className="muted">
                #{row.recordIndex + 1}
                {row.itemIndex !== undefined ? `[${row.itemIndex}]` : ""}
              </span>{" "}
              {error ? (
                <span className={styles.warn}>
                  {error.code} — {error.message}
                </span>
              ) : value === "" ? (
                <span className={styles.exampleMarker}>(빈칸)</span>
              ) : (
                <span className={styles.exampleValue}>{value}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PolicyRow({
  label,
  hint,
  policy,
  required,
  onChange,
}: {
  label: string;
  hint: string;
  policy: Policy;
  required: boolean;
  onChange: (policy: Policy) => void;
}) {
  return (
    <div className={styles.policyRow} title={hint}>
      <span>{label}</span>
      <select
        value={policy.action}
        onChange={(event) => {
          const action = event.target.value as Policy["action"];
          onChange(action === "default" ? { action, value: "" } : { action });
        }}
      >
        <option value="blank" disabled={required}>
          빈칸{required ? " (필수 컬럼 불가)" : ""}
        </option>
        <option value="default">기본값</option>
        <option value="error">오류</option>
      </select>
      {policy.action === "default" && (
        <input
          type="text"
          value={policy.value}
          placeholder="기본값"
          onChange={(event) => onChange({ action: "default", value: event.target.value })}
        />
      )}
    </div>
  );
}
