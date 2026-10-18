"use client";

import { useMemo } from "react";
import type { ConversionResult } from "@/core/engine/convert";
import type { JsonValue } from "@/core/json/value";
import type { MappingConfig } from "@/core/mapping/config";
import type { ConfigIssue } from "@/core/mapping/validate";
import { COLUMN_STATUS_LABEL, columnStatus, describeSource, describeSteps, type ColumnStatus } from "@/core/preview/describe";
import { sourceExamples } from "@/core/preview/examples";
import type { OutputSchema } from "@/schemas/output-schema";
import styles from "./editor.module.css";

interface Props {
  schema: OutputSchema;
  config: MappingConfig;
  records: JsonValue[] | null;
  issues: ConfigIssue[];
  preview: ConversionResult | null;
  selectedId: string;
  onSelect: (columnId: string) => void;
}

const STATUS_CLASS: Record<ColumnStatus, string> = {
  unmapped: styles.statusUnmapped,
  blank: styles.statusBlank,
  review: styles.statusReview,
  configured: styles.statusOk,
};

export function MappingTable({ schema, config, records, issues, preview, selectedId, onSelect }: Props) {
  const rows = useMemo(
    () =>
      schema.columns.map((column, index) => {
        const mapping = config.columns.find((m) => m.columnId === column.id)!;
        const example = records ? sourceExamples(mapping, config, records, 1)[0] : undefined;
        const firstRow = preview?.rows[0];
        const resultError = firstRow
          ? preview?.errors.find(
              (e) =>
                e.recordIndex === firstRow.recordIndex &&
                e.columnId === column.id &&
                (e.itemIndex === undefined || e.itemIndex === firstRow.itemIndex),
            )
          : undefined;
        return {
          column,
          mapping,
          example,
          result: firstRow ? (resultError ? `⚠ ${resultError.code}` : firstRow.cells[index]) : undefined,
          status: columnStatus(mapping, column.header, issues, preview?.errors ?? []),
        };
      }),
    [schema, config, records, issues, preview],
  );

  return (
    <div className={styles.tableWrap}>
      <table className={styles.mappingTable}>
        <thead>
          <tr>
            <th>CSV 컬럼</th>
            <th>입력 경로</th>
            <th>원본 예시</th>
            <th>변환 규칙</th>
            <th>결과 예시</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ column, mapping, example, result, status }) => (
            <tr
              key={column.id}
              className={column.id === selectedId ? styles.selectedRow : undefined}
              onClick={() => onSelect(column.id)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(column.id);
                }
              }}
              aria-selected={column.id === selectedId}
            >
              <td>
                <strong>{column.header}</strong>
                {column.required && <span className={styles.required}>필수</span>}
              </td>
              <td>
                <code className={styles.pathCell}>{describeSource(mapping.source)}</code>
              </td>
              <td className={styles.clip}>
                {example === undefined ? (
                  <span className="muted">—</span>
                ) : example.kind === "value" ? (
                  example.text
                ) : (
                  <span className={example.kind === "error" ? styles.warn : styles.exampleMarker}>({example.text})</span>
                )}
              </td>
              <td className="muted">{describeSteps(mapping.steps)}</td>
              <td className={styles.clip}>
                {result === undefined ? <span className="muted">—</span> : result === "" ? <span className={styles.exampleMarker}>(빈칸)</span> : result}
              </td>
              <td>
                <span className={STATUS_CLASS[status]}>{COLUMN_STATUS_LABEL[status]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
