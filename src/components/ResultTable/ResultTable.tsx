"use client";

import { useMemo, useState } from "react";
import type { OutputRow } from "@/core/engine/convert";
import type { ConversionError } from "@/core/errors/errors";
import styles from "./ResultTable.module.css";

interface Props {
  headers: string[];
  columnIds: string[];
  rows: OutputRow[];
  errors: ConversionError[];
  /** 이 행들이 어디서 왔는지(예: "샘플 앞 100건에서 만든 행") */
  sourceLabel: string;
  /** 처음에 보여줄 최대 행 수(조정 가능한 기본값) */
  initialLimit?: number;
}

const errorKey = (recordIndex: number, itemIndex: number | undefined, columnId: string) =>
  `${recordIndex}:${itemIndex ?? "*"}:${columnId}`;

interface Selected {
  row: OutputRow;
  column: number;
}

export function ResultTable({ headers, columnIds, rows, errors, sourceLabel, initialLimit = 100 }: Props) {
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [limit, setLimit] = useState(initialLimit);
  const [selected, setSelected] = useState<Selected | null>(null);

  const errorIndex = useMemo(() => {
    const map = new Map<string, ConversionError[]>();
    for (const error of errors) {
      if (!error.columnId) continue;
      const key = errorKey(error.recordIndex, error.itemIndex, error.columnId);
      map.set(key, [...(map.get(key) ?? []), error]);
    }
    return map;
  }, [errors]);

  // 레코드 기준 컬럼 오류는 itemIndex 없이 기록되므로 그 레코드의 모든 행에 표시한다.
  const cellErrors = (row: OutputRow, column: number) => {
    const columnId = columnIds[column];
    return [
      ...(errorIndex.get(errorKey(row.recordIndex, row.itemIndex, columnId)) ?? []),
      ...(row.itemIndex !== undefined ? (errorIndex.get(errorKey(row.recordIndex, undefined, columnId)) ?? []) : []),
    ];
  };

  const filtered = errorsOnly ? rows.filter((row) => row.failed) : rows;
  const shown = filtered.slice(0, limit);
  const recordErrors = errors.filter((error) => !error.columnId);

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <span className="muted">
          {sourceLabel} · {errorsOnly ? "오류 행 " : "전체 "}
          {filtered.length}행 중 {shown.length === filtered.length ? "모두" : `처음 ${shown.length}행`} 표시
        </span>
        <label className={styles.toggle}>
          <input type="checkbox" checked={errorsOnly} onChange={(event) => setErrorsOnly(event.target.checked)} /> 오류만 보기
        </label>
      </div>

      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.rowHead}>원본</th>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={`${row.recordIndex}-${row.itemIndex ?? ""}`} className={row.failed ? styles.failedRow : undefined}>
                <th className={styles.rowHead} scope="row">
                  #{row.recordIndex + 1}
                  {row.itemIndex !== undefined && <span className="muted">[{row.itemIndex}]</span>}
                </th>
                {row.cells.map((cell, column) => {
                  const cellError = cellErrors(row, column);
                  const className = [cellError.length > 0 ? styles.errorCell : "", cell === "" ? styles.empty : ""].join(" ");
                  return (
                    <td
                      key={column}
                      className={className}
                      onClick={() => setSelected({ row, column })}
                      title={cellError.length > 0 ? cellError.map((e) => e.message).join("\n") : cell}
                    >
                      {cellError.length > 0 ? <span className={styles.code}>{cellError[0].code}</span> : cell}
                    </td>
                  );
                })}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={headers.length + 1} className="muted" style={{ textAlign: "center", padding: 20 }}>
                  {errorsOnly ? "오류 행이 없습니다." : "표시할 행이 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > shown.length && (
        <button type="button" className="btn btn-small" onClick={() => setLimit((value) => value + initialLimit)}>
          {initialLimit}행 더 보기
        </button>
      )}

      {selected && (
        <div className={styles.detail}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>
              {headers[selected.column]} · 원본 #{selected.row.recordIndex + 1}
              {selected.row.itemIndex !== undefined && ` 항목 [${selected.row.itemIndex}]`}
            </strong>
            <button type="button" className="btn btn-small" onClick={() => setSelected(null)}>
              닫기
            </button>
          </div>
          {cellErrors(selected.row, selected.column).map((error, i) => (
            <p key={i} className={styles.detailError}>
              {error.code}
              {error.path ? ` · ${error.path}` : ""} — {error.message}
            </p>
          ))}
          <p className="muted" style={{ fontSize: "0.8rem" }}>
            CSV에 쓰일 값 ({selected.row.cells[selected.column].length}자)
          </p>
          <pre className={styles.value}>{selected.row.cells[selected.column] || "(빈 값)"}</pre>
        </div>
      )}

      {recordErrors.length > 0 && (
        <div className={styles.recordErrors}>
          {recordErrors.slice(0, 20).map((error, i) => (
            <p key={i}>
              {error.recordIndex >= 0 ? `원본 #${error.recordIndex + 1}` : "파일"} · {error.code} — {error.message}
            </p>
          ))}
          {recordErrors.length > 20 && <p className="muted">외 {recordErrors.length - 20}건</p>}
        </div>
      )}
    </div>
  );
}
