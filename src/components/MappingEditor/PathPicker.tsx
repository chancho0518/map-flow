"use client";

import { useState } from "react";
import { KIND_LABEL, type JsonKind } from "@/core/json/value";
import { formatPath, type Path } from "@/core/paths/path";
import { filterFieldOptions, type FieldOption } from "@/core/preview/fields";
import styles from "./editor.module.css";

interface Props {
  label: string;
  value: Path | null;
  options: FieldOption[] | null;
  /** 레코드 수(존재 비율 표시용) */
  sampled: number;
  onChange: (path: Path) => void;
  /** 표시용 접두사(예: "항목.") */
  prefix?: string;
}

export function kindSummary(kinds: Partial<Record<JsonKind, number>>): string {
  return Object.entries(kinds)
    .map(([kind, count]) => `${KIND_LABEL[kind as JsonKind]} ${count}`)
    .join(" · ");
}

/** 샘플 프로파일에서 경로를 검색·선택한다. 전체 경로를 표시하고 문자열 JSON 출처를 구분한다. */
export function PathPicker({ label, value, options, sampled, onChange, prefix = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = value ? prefix + formatPath(value) : "선택 안 됨";
  const currentKey = value ? JSON.stringify(value) : null;
  const known = !value || !options || options.some((option) => JSON.stringify(option.path) === currentKey);

  return (
    <div className={styles.picker}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className={styles.fieldLabel}>{label}</span>
        <button type="button" className="btn btn-small" onClick={() => setOpen(!open)} disabled={!options}>
          {open ? "닫기" : "경로 선택"}
        </button>
      </div>
      <code className={styles.path}>{current}</code>
      {!known && <span className={styles.warn}>샘플 분석 범위에서 이 경로를 찾지 못했습니다.</span>}
      {!options && <span className="muted" style={{ fontSize: "0.8rem" }}>샘플을 불러오면 경로를 선택할 수 있습니다.</span>}

      {open && options && (
        <div className={styles.pickerPanel}>
          <input
            type="search"
            placeholder="경로 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
          <ul className={styles.optionList}>
            {filterFieldOptions(options, query).map((option) => {
              const { field } = option;
              const selected = JSON.stringify(option.path) === currentKey;
              return (
                <li key={JSON.stringify(option.path)}>
                  <button
                    type="button"
                    className={selected ? styles.optionSelected : styles.option}
                    onClick={() => {
                      onChange(option.path);
                      setOpen(false);
                    }}
                  >
                    <span className={styles.optionPath}>
                      {prefix}
                      {formatPath(option.path)}
                      {field.fromStringJson && <span className={styles.badge}>문자열 JSON</span>}
                      {field.stringJsonFailures > 0 && (
                        <span className={styles.badgeWarn}>해석 실패 {field.stringJsonFailures}</span>
                      )}
                    </span>
                    <span className={styles.optionMeta}>
                      {kindSummary(field.kinds)} · {field.presentIn}/{sampled}건에 있음
                      {field.samples.length > 0 && ` · 예: ${field.samples.join(", ")}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
