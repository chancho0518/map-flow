"use client";

import { FilePicker } from "@/components/FilePicker/FilePicker";
import type { JsonValue } from "@/core/json/value";
import type { MappingConfig } from "@/core/mapping/config";
import { formatPath } from "@/core/paths/path";
import { MAX_SAMPLE_BYTES, PREVIEW_RECORD_LIMIT, type SampleRecords } from "@/core/preview/sample";
import type { RecordCandidate } from "@/core/records/records";
import { formatBytes } from "@/lib/browser";
import { kindSummary } from "./PathPicker";
import styles from "./editor.module.css";

export interface LoadedSample {
  fileName: string;
  size: number;
  root: JsonValue;
  candidates: RecordCandidate[];
}

interface Props {
  sample: LoadedSample | null;
  sampleError: string | null;
  sampleData: SampleRecords | null;
  config: MappingConfig;
  onFile: (file: File) => void;
  onRecordsChange: (records: MappingConfig["records"]) => void;
  onLimitsChange: (limits: MappingConfig["stringJson"]) => void;
}

const sameRecords = (a: MappingConfig["records"], b: MappingConfig["records"]) =>
  a.mode === b.mode && JSON.stringify(a.path) === JSON.stringify(b.path);

export function SampleSection({ sample, sampleError, sampleData, config, onFile, onRecordsChange, onLimitsChange }: Props) {
  const fields = sampleData?.ok ? sampleData.profile.fields : [];
  const decoded = fields.filter((field) => {
    const last = field.path[field.path.length - 1];
    return typeof last === "object" && "decode" in last;
  });
  const failures = fields.filter((field) => field.stringJsonFailures > 0);
  const mixed = fields.filter((field) => Object.keys(field.kinds).length > 1);
  const currentListed = sample?.candidates.some((candidate) => sameRecords(candidate, config.records)) ?? false;

  return (
    <section className="card">
      <h2>1. 샘플 선택 · 구조 분석</h2>
      <div className="row" style={{ marginBottom: 8 }}>
        <FilePicker label={sample ? "다른 샘플 선택" : "샘플 JSON 선택"} onFile={onFile} className="btn btn-primary" />
        {sample && (
          <span>
            <strong>{sample.fileName}</strong> <span className="muted">({formatBytes(sample.size)})</span>
          </span>
        )}
      </div>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        샘플은 이 브라우저 안에서만 분석하며 서버로 보내지 않습니다. 샘플 원본은 설정에 저장되지 않으므로 나중에 편집할 때 다시
        선택해야 합니다. 최대 {formatBytes(MAX_SAMPLE_BYTES)}.
      </p>
      {sampleError && <p className={styles.errorText}>{sampleError}</p>}

      {sample && (
        <div className={styles.stack} style={{ marginTop: 12 }}>
          <h3 className={styles.subTitle}>레코드 목록</h3>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            CSV 한 행의 기준이 되는 레코드가 들어 있는 위치를 고르세요.
          </p>
          <div className={styles.candidates}>
            {sample.candidates.map((candidate) => (
              <label key={`${candidate.mode}:${JSON.stringify(candidate.path)}`} className={styles.candidate}>
                <input
                  type="radio"
                  name="records"
                  checked={sameRecords(candidate, config.records)}
                  onChange={() => onRecordsChange({ mode: candidate.mode, path: candidate.path })}
                />
                <code>{candidate.path.length === 0 ? "(최상위)" : formatPath(candidate.path)}</code>
                <span className="muted">
                  {candidate.mode === "array"
                    ? `배열 ${candidate.count}건${candidate.objectCount !== candidate.count ? ` (객체 ${candidate.objectCount}건)` : ""}`
                    : "단일 객체 = 레코드 1건"}
                </span>
              </label>
            ))}
            {!currentListed && (
              <p className={styles.warn}>
                현재 설정의 레코드 위치({config.records.mode === "single" ? "단일 객체" : "배열"} {formatPath(config.records.path)})가 후보에
                없습니다.
              </p>
            )}
          </div>

          {sampleData && !sampleData.ok && <p className={styles.errorText}>{sampleData.message}</p>}
          {sampleData?.ok && (
            <>
              <p className={styles.summary}>
                파일 전체 레코드 <strong>{sampleData.totalRecords.toLocaleString()}건</strong> · 구조 분석 앞{" "}
                {sampleData.records.length.toLocaleString()}건 · 미리보기 변환 앞{" "}
                {Math.min(PREVIEW_RECORD_LIMIT, sampleData.records.length).toLocaleString()}건
              </p>
              {(decoded.length > 0 || failures.length > 0 || mixed.length > 0) && (
                <ul className={styles.findings}>
                  {decoded.map((field) => (
                    <li key={field.display}>
                      <code>{field.display.replace(/\(JSON\)$/, "")}</code>: 문자열 JSON {field.presentIn}건 해석
                    </li>
                  ))}
                  {failures.map((field) => (
                    <li key={`f-${field.display}`} className={styles.warn}>
                      <code>{field.display}</code>: JSON처럼 보이지만 해석 실패 {field.stringJsonFailures}건 (원문 보존, 이 경로를 쓰는 컬럼은
                      오류 정책 적용)
                    </li>
                  ))}
                  {mixed.slice(0, 8).map((field) => (
                    <li key={`m-${field.display}`}>
                      <code>{field.display}</code>: 타입 혼재 — {kindSummary(field.kinds)}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <details className={styles.advanced}>
        <summary>문자열 JSON 해석 한도</summary>
        <div className="row" style={{ marginTop: 8 }}>
          <label className={styles.inline}>
            중첩 인코딩 최대 깊이
            <input
              type="number"
              min={1}
              max={5}
              value={config.stringJson.maxDepth}
              onChange={(event) =>
                onLimitsChange({ ...config.stringJson, maxDepth: Math.min(5, Math.max(1, Math.trunc(Number(event.target.value) || 1))) })
              }
            />
          </label>
          <label className={styles.inline}>
            단일 문자열 최대 길이(자)
            <input
              type="number"
              min={1}
              value={config.stringJson.maxStringLength}
              onChange={(event) =>
                onLimitsChange({ ...config.stringJson, maxStringLength: Math.max(1, Math.trunc(Number(event.target.value) || 1)) })
              }
            />
          </label>
        </div>
      </details>
    </section>
  );
}
