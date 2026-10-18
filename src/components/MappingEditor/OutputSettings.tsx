"use client";

import type { MappingConfig } from "@/core/mapping/config";
import { formatPath } from "@/core/paths/path";
import { arrayOptionsAt } from "@/core/preview/fields";
import type { FieldProfile } from "@/core/profiling/profile";
import styles from "./editor.module.css";

interface ExplodeProps {
  config: MappingConfig;
  fields: FieldProfile[] | null;
  onChange: (explode: MappingConfig["explode"]) => void;
}

/** 행 펼치기: 레코드 안 배열 하나를 여러 행으로 */
export function ExplodeSettings({ config, fields, onChange }: ExplodeProps) {
  const options = fields ? arrayOptionsAt(fields, []).map((option) => option.path) : [];
  const current = config.explode?.path;
  const keys = options.map((path) => JSON.stringify(path));
  if (current && !keys.includes(JSON.stringify(current))) {
    options.push(current);
    keys.push(JSON.stringify(current));
  }

  return (
    <section className="card">
      <h2>2. 배열 규칙</h2>
      <p className="muted" style={{ fontSize: "0.85rem", marginBottom: 8 }}>
        기본은 레코드 1건 = CSV 1행입니다. 레코드 안 배열 <strong>하나</strong>를 골라 항목마다 한 행씩 만들 수 있습니다(레코드의 다른 값은 각
        행에 복사). 여러 배열을 동시에 펼치는 기능은 지원하지 않습니다. 배열에서 값 하나만 고르거나 셀 하나로 합치려면 컬럼 소스에서 &lsquo;배열
        항목 선택&rsquo; 또는 &lsquo;배열 셀 결합&rsquo;을 쓰세요.
      </p>
      <div className="row">
        <label className={styles.inline}>
          행 펼치기
          <select
            value={current ? JSON.stringify(current) : ""}
            onChange={(event) =>
              onChange(
                event.target.value === ""
                  ? undefined
                  : { path: JSON.parse(event.target.value), onEmpty: config.explode?.onEmpty ?? "blankRow" },
              )
            }
          >
            <option value="">펼치지 않음</option>
            {options.map((path, i) => (
              <option key={keys[i]} value={keys[i]}>
                {formatPath(path)}
              </option>
            ))}
          </select>
        </label>
        {config.explode && (
          <label className={styles.inline}>
            빈 배열·누락일 때
            <select
              value={config.explode.onEmpty}
              onChange={(event) =>
                onChange({ ...config.explode!, onEmpty: event.target.value as NonNullable<MappingConfig["explode"]>["onEmpty"] })
              }
            >
              <option value="blankRow">항목 값 없이 한 행</option>
              <option value="skipRecord">행을 만들지 않음</option>
              <option value="error">오류</option>
            </select>
          </label>
        )}
      </div>
      {!fields && <p className="muted" style={{ fontSize: "0.85rem", marginTop: 6 }}>샘플을 불러오면 배열 목록이 표시됩니다.</p>}
    </section>
  );
}

interface CsvProps {
  config: MappingConfig;
  onCsvChange: (csv: MappingConfig["csv"]) => void;
  onErrorModeChange: (mode: MappingConfig["errorMode"]) => void;
}

export function CsvSettings({ config, onCsvChange, onErrorModeChange }: CsvProps) {
  const csv = config.csv;
  return (
    <section className="card">
      <h2>5. CSV · 오류 처리</h2>
      <div className={styles.settingsGrid}>
        <label className={styles.inline}>
          <input type="checkbox" checked={csv.bom} onChange={(event) => onCsvChange({ ...csv, bom: event.target.checked })} />
          UTF-8 BOM 포함 (엑셀 한글 깨짐 방지)
        </label>
        <label className={styles.inline}>
          줄바꿈
          <select value={csv.lineEnding} onChange={(event) => onCsvChange({ ...csv, lineEnding: event.target.value as "CRLF" | "LF" })}>
            <option value="CRLF">CRLF (Windows·엑셀)</option>
            <option value="LF">LF</option>
          </select>
        </label>
        <label className={styles.inline}>
          구분자
          <select
            value={csv.delimiter}
            onChange={(event) => onCsvChange({ ...csv, delimiter: event.target.value as MappingConfig["csv"]["delimiter"] })}
          >
            <option value=",">쉼표 (,)</option>
            <option value=";">세미콜론 (;)</option>
            <option value={"\t"}>탭</option>
          </select>
        </label>
        <label className={styles.inline}>
          수식 위험값
          <select
            value={csv.formulaPolicy}
            onChange={(event) => onCsvChange({ ...csv, formulaPolicy: event.target.value as "escape" | "keep" })}
          >
            <option value="escape">앞에 &apos; 추가 (안전)</option>
            <option value="keep">그대로 (원문 유지)</option>
          </select>
        </label>
        <label className={styles.inline}>
          오류가 있을 때
          <select value={config.errorMode} onChange={(event) => onErrorModeChange(event.target.value as "partial" | "strict")}>
            <option value="partial">부분 성공: 정상 행만 CSV + 오류 보고서</option>
            <option value="strict">엄격: 오류가 하나라도 있으면 실패</option>
          </select>
        </label>
      </div>
      <p className="muted" style={{ fontSize: "0.8rem", marginTop: 8 }}>
        &lsquo;안전&rsquo;은 = + - @ 탭으로 시작하는 문자열 값 앞에 &apos;를 붙여 스프레드시트가 수식으로 실행하지 않게 합니다. 이 때문에
        +82-10-… 같은 값은 &apos;+82-10-…으로 바뀝니다. CSV에는 셀 자료형이 없어 엑셀에서 열면 앞자리 0이 사라질 수 있으니, 데이터 → 텍스트/CSV
        가져오기에서 해당 열을 텍스트로 지정하세요.
      </p>
    </section>
  );
}
