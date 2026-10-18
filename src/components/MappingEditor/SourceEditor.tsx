"use client";

import type { PathRef, Source } from "@/core/mapping/config";
import type { Path } from "@/core/paths/path";
import { arrayOptionsAt, EACH, optionsAt, scopeBase } from "@/core/preview/fields";
import { SOURCE_KIND_LABEL } from "@/core/preview/describe";
import type { FieldProfile } from "@/core/profiling/profile";
import { PathPicker } from "./PathPicker";
import styles from "./editor.module.css";

export interface FieldContext {
  /** 샘플 프로파일 필드(샘플이 없으면 null) */
  fields: FieldProfile[] | null;
  sampled: number;
  explodePath?: Path;
}

type Scope = PathRef["scope"];

function emptySource(kind: Source["kind"]): Source {
  switch (kind) {
    case "unmapped":
    case "blank":
      return { kind };
    case "constant":
      return { kind, value: "" };
    case "path":
      return { kind, scope: "record", path: [] };
    case "firstOf":
      return { kind, sources: [emptyRef(), emptyRef()] };
    case "concat":
      return { kind, parts: [emptyRef()], separator: " ", skipEmpty: true };
    case "pick":
      return {
        kind,
        scope: "record",
        arrayPath: [],
        select: { by: "index", index: 0 },
        valuePath: [],
        onNone: "missing",
        onMany: "error",
      };
    case "join":
      return { kind, scope: "record", arrayPath: [], valuePath: [], separator: ", ", skipMissing: true };
  }
}

function emptyRef(): PathRef {
  return { kind: "path", scope: "record", path: [] };
}

const asValue = (path: Path) => (path.length > 0 ? path : null);

function ScopeSelect({ scope, ctx, onChange }: { scope: Scope; ctx: FieldContext; onChange: (scope: Scope) => void }) {
  if (!ctx.explodePath && scope === "record") return null;
  return (
    <label className={styles.inline}>
      기준
      <select value={scope} onChange={(event) => onChange(event.target.value as Scope)}>
        <option value="record">레코드</option>
        <option value="item" disabled={!ctx.explodePath}>
          펼친 배열 항목
        </option>
      </select>
    </label>
  );
}

function RefEditor({ value, ctx, label, onChange }: { value: PathRef; ctx: FieldContext; label: string; onChange: (ref: PathRef) => void }) {
  const options = ctx.fields ? optionsAt(ctx.fields, scopeBase(value.scope, ctx.explodePath)) : null;
  return (
    <div className={styles.refBox}>
      <ScopeSelect scope={value.scope} ctx={ctx} onChange={(scope) => onChange({ ...value, scope, path: [] })} />
      <PathPicker
        label={label}
        value={asValue(value.path)}
        options={options}
        sampled={ctx.sampled}
        prefix={value.scope === "item" ? "항목." : ""}
        onChange={(path) => onChange({ ...value, path })}
      />
    </div>
  );
}

interface Props {
  source: Source;
  ctx: FieldContext;
  onChange: (source: Source) => void;
}

export function SourceEditor({ source, ctx, onChange }: Props) {
  return (
    <div className={styles.stack}>
      <label className={styles.inline}>
        소스 종류
        <select value={source.kind} onChange={(event) => onChange(emptySource(event.target.value as Source["kind"]))}>
          {(Object.keys(SOURCE_KIND_LABEL) as Source["kind"][]).map((kind) => (
            <option key={kind} value={kind}>
              {SOURCE_KIND_LABEL[kind]}
            </option>
          ))}
        </select>
      </label>
      <SourceBody source={source} ctx={ctx} onChange={onChange} />
    </div>
  );
}

function SourceBody({ source, ctx, onChange }: Props) {
  switch (source.kind) {
    case "unmapped":
      return <p className="muted">아직 연결하지 않았습니다. 연결하지 않을 선택 컬럼은 &lsquo;빈칸&rsquo;을 고르세요.</p>;
    case "blank":
      return <p className="muted">이 컬럼은 항상 빈칸으로 출력합니다.</p>;
    case "constant":
      return (
        <label className={styles.inline}>
          고정값
          <input type="text" value={source.value} onChange={(event) => onChange({ ...source, value: event.target.value })} />
        </label>
      );
    case "path":
      return <RefEditor value={source} ctx={ctx} label="입력 경로" onChange={(ref) => onChange(ref)} />;

    case "firstOf":
      return (
        <div className={styles.stack}>
          <p className="muted">값이 있는(누락·null·빈 문자열이 아닌) 첫 경로를 씁니다. 위쪽 경로가 손상되면 오류로 처리합니다.</p>
          {source.sources.map((ref, index) => (
            <div key={index} className={styles.listItem}>
              <RefEditor
                value={ref}
                ctx={ctx}
                label={`${index + 1}순위`}
                onChange={(next) => onChange({ ...source, sources: source.sources.map((r, i) => (i === index ? next : r)) })}
              />
              <button
                type="button"
                className="btn btn-small"
                disabled={source.sources.length <= 2}
                onClick={() => onChange({ ...source, sources: source.sources.filter((_, i) => i !== index) })}
              >
                제거
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-small" onClick={() => onChange({ ...source, sources: [...source.sources, emptyRef()] })}>
            경로 추가
          </button>
        </div>
      );

    case "concat":
      return (
        <div className={styles.stack}>
          {source.parts.map((part, index) => (
            <div key={index} className={styles.listItem}>
              {part.kind === "literal" ? (
                <label className={styles.inline}>
                  문자
                  <input
                    type="text"
                    value={part.value}
                    onChange={(event) =>
                      onChange({
                        ...source,
                        parts: source.parts.map((p, i) => (i === index ? { kind: "literal", value: event.target.value } : p)),
                      })
                    }
                  />
                </label>
              ) : (
                <RefEditor
                  value={part}
                  ctx={ctx}
                  label={`부분 ${index + 1}`}
                  onChange={(next) => onChange({ ...source, parts: source.parts.map((p, i) => (i === index ? next : p)) })}
                />
              )}
              <button
                type="button"
                className="btn btn-small"
                disabled={source.parts.length <= 1}
                onClick={() => onChange({ ...source, parts: source.parts.filter((_, i) => i !== index) })}
              >
                제거
              </button>
            </div>
          ))}
          <div className="row">
            <button type="button" className="btn btn-small" onClick={() => onChange({ ...source, parts: [...source.parts, emptyRef()] })}>
              경로 추가
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => onChange({ ...source, parts: [...source.parts, { kind: "literal", value: "" }] })}
            >
              문자 추가
            </button>
          </div>
          <label className={styles.inline}>
            구분자
            <input type="text" value={source.separator} onChange={(event) => onChange({ ...source, separator: event.target.value })} />
          </label>
          <label className={styles.inline}>
            <input type="checkbox" checked={source.skipEmpty} onChange={(event) => onChange({ ...source, skipEmpty: event.target.checked })} />
            값이 없는 부분은 건너뛰기 (해제하면 오류)
          </label>
        </div>
      );

    case "pick":
    case "join":
      return <ArraySourceEditor source={source} ctx={ctx} onChange={onChange} />;
  }
}

function PickSelectEditor({
  source,
  itemOptions,
  ctx,
  onChange,
}: {
  source: Extract<Source, { kind: "pick" }>;
  itemOptions: ReturnType<typeof optionsAt> | null;
  ctx: FieldContext;
  onChange: (source: Source) => void;
}) {
  const select = source.select;
  return (
    <>
      <label className={styles.inline}>
        항목 선택
        <select
          value={select.by}
          onChange={(event) =>
            onChange({
              ...source,
              select: event.target.value === "index" ? { by: "index", index: 0 } : { by: "match", field: [], equals: "" },
            })
          }
        >
          <option value="index">순서(인덱스)</option>
          <option value="match">조건(필드 값이 같은 항목)</option>
        </select>
      </label>
      {select.by === "index" ? (
        <label className={styles.inline}>
          인덱스(0부터)
          <input
            type="number"
            min={0}
            value={select.index}
            onChange={(event) =>
              onChange({ ...source, select: { by: "index", index: Math.max(0, Math.trunc(Number(event.target.value) || 0)) } })
            }
          />
        </label>
      ) : (
        <>
          <PathPicker
            label="조건 필드(항목 기준)"
            value={asValue(select.field)}
            options={itemOptions}
            sampled={ctx.sampled}
            onChange={(field) => onChange({ ...source, select: { ...select, field } })}
          />
          <label className={styles.inline}>
            값이
            <input
              type="text"
              value={select.equals}
              onChange={(event) => onChange({ ...source, select: { ...select, equals: event.target.value } })}
            />
            인 항목
          </label>
        </>
      )}
    </>
  );
}

function ArraySourceEditor({
  source,
  ctx,
  onChange,
}: {
  source: Extract<Source, { kind: "pick" | "join" }>;
  ctx: FieldContext;
  onChange: (source: Source) => void;
}) {
  const base = scopeBase(source.scope, ctx.explodePath);
  const prefix = source.scope === "item" ? "항목." : "";
  const arrays = ctx.fields ? arrayOptionsAt(ctx.fields, base) : null;
  const itemOptions = ctx.fields && source.arrayPath.length > 0 ? optionsAt(ctx.fields, [...base, ...source.arrayPath, EACH]) : null;

  return (
    <div className={styles.stack}>
      <ScopeSelect scope={source.scope} ctx={ctx} onChange={(scope) => onChange({ ...source, scope, arrayPath: [], valuePath: [] })} />
      <PathPicker
        label="배열"
        value={asValue(source.arrayPath)}
        options={arrays}
        sampled={ctx.sampled}
        prefix={prefix}
        onChange={(arrayPath) => onChange({ ...source, arrayPath, valuePath: [] })}
      />

      {source.kind === "pick" && <PickSelectEditor source={source} itemOptions={itemOptions} ctx={ctx} onChange={onChange} />}

      <PathPicker
        label="가져올 값(항목 기준)"
        value={asValue(source.valuePath)}
        options={itemOptions}
        sampled={ctx.sampled}
        onChange={(valuePath) => onChange({ ...source, valuePath })}
      />

      {source.kind === "pick" ? (
        <div className="row">
          <label className={styles.inline}>
            일치 0건
            <select value={source.onNone} onChange={(event) => onChange({ ...source, onNone: event.target.value as "missing" | "error" })}>
              <option value="missing">누락으로 처리</option>
              <option value="error">오류</option>
            </select>
          </label>
          <label className={styles.inline}>
            일치 여러 건
            <select value={source.onMany} onChange={(event) => onChange({ ...source, onMany: event.target.value as "first" | "error" })}>
              <option value="error">오류</option>
              <option value="first">첫 항목</option>
            </select>
          </label>
        </div>
      ) : (
        <>
          <label className={styles.inline}>
            구분자
            <input type="text" value={source.separator} onChange={(event) => onChange({ ...source, separator: event.target.value })} />
          </label>
          <label className={styles.inline}>
            <input
              type="checkbox"
              checked={source.skipMissing}
              onChange={(event) => onChange({ ...source, skipMissing: event.target.checked })}
            />
            값이 없는 요소는 건너뛰기 (해제하면 오류)
          </label>
        </>
      )}
    </div>
  );
}
