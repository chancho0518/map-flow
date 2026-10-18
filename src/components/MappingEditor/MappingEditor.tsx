"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ResultTable } from "@/components/ResultTable/ResultTable";
import { compileMapping, convertRecords } from "@/core/engine/convert";
import { MappingConfigSchema, type ColumnMapping, type MappingConfig } from "@/core/mapping/config";
import { alignColumns, createEmptyConfig, nextDraftVersion } from "@/core/mapping/factory";
import { validateMappingConfig, type ConfigIssue } from "@/core/mapping/validate";
import { MAX_SAMPLE_BYTES, parseSample, PREVIEW_RECORD_LIMIT, sampleRecords } from "@/core/preview/sample";
import demoInput from "@/fixtures/b-string-json/input.json";
import demoMapping from "@/fixtures/b-string-json/mapping.json";
import { downloadText, formatBytes, newId, nowIso } from "@/lib/browser";
import { demoSchema } from "@/schemas/load";
import { getLatestMapping, requestPersistentStorage, saveMapping } from "@/storage/mapping-store";
import { exportMappingJson, mappingFileName } from "@/storage/transfer";
import { ColumnDetail } from "./ColumnDetail";
import { MappingTable } from "./MappingTable";
import { CsvSettings, ExplodeSettings } from "./OutputSettings";
import { SampleSection, type LoadedSample } from "./SampleSection";
import styles from "./editor.module.css";

const schema = demoSchema;

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready" };

interface Message {
  tone: "info" | "error";
  text: string;
}

interface Loaded {
  config: MappingConfig;
  /** 변경 여부 비교 기준(JSON): 마지막 저장 상태 또는 처음 연 상태 */
  saved: string;
  /** 사용 가능 버전을 편집해 다음 버전을 만드는 중이면 그 버전 번호 */
  fromReady?: number;
  sample?: LoadedSample;
}

function demoSample(): LoadedSample {
  const text = JSON.stringify(demoInput);
  const parsed = parseSample(text);
  if (!parsed.ok) throw new Error(parsed.message);
  return { fileName: "demo-customers.json (데모)", size: text.length, root: parsed.root, candidates: parsed.candidates };
}

async function loadInitial(id: string | null, demo: boolean): Promise<Loaded> {
  const now = nowIso();
  if (demo) {
    const base = MappingConfigSchema.parse(demoMapping);
    const config = { ...base, id: newId(), name: "데모: 문자열 JSON 고객", version: 1, status: "draft" as const, createdAt: now, updatedAt: now };
    return { config, saved: JSON.stringify(config), sample: demoSample() };
  }
  if (id) {
    const latest = await getLatestMapping(id);
    if (!latest) throw new Error("설정을 찾을 수 없습니다. 삭제되었거나 다른 브라우저에서 만든 설정일 수 있습니다.");
    const aligned = alignColumns(latest, schema);
    if (latest.status === "ready") {
      const draft = nextDraftVersion(aligned, now);
      return { config: draft, saved: JSON.stringify(draft), fromReady: latest.version };
    }
    return { config: aligned, saved: JSON.stringify(aligned) };
  }
  const config = createEmptyConfig(schema, newId(), "새 매핑 설정", now);
  return { config, saved: JSON.stringify(config) };
}

export function MappingEditor() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  const demo = params.get("demo") === "1";

  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [config, setConfig] = useState<MappingConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [fromReady, setFromReady] = useState<number | undefined>();
  const [sample, setSample] = useState<LoadedSample | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(schema.columns[0].id);
  const [message, setMessage] = useState<Message | null>(null);
  const [saving, setSaving] = useState(false);
  /** 이미 이 화면에 불러온 설정 ID. 저장 후 URL만 바뀔 때 다시 불러오지 않는다. */
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    if (config && id !== null && id === loadedId.current) return;
    let cancelled = false;
    loadInitial(id, demo)
      .then((loaded) => {
        if (cancelled) return;
        loadedId.current = loaded.config.id;
        setConfig(loaded.config);
        setSaved(loaded.saved);
        setFromReady(loaded.fromReady);
        if (loaded.sample) setSample(loaded.sample);
        setLoad({ state: "ready" });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ state: "error", message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
    // config는 의도적으로 제외: URL(id, demo)이 바뀔 때만 다시 불러온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, demo]);

  const dirty = config !== null && JSON.stringify(config) !== saved;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // 미리보기는 입력을 막지 않도록 지연 값으로 계산한다(동기 계산이라 오래된 응답이 섞이지 않는다).
  const deferred = useDeferredValue(config);
  const recordsSetting = deferred?.records;
  const limits = deferred?.stringJson;
  const sampleData = useMemo(
    () => (sample && recordsSetting && limits ? sampleRecords(sample.root, recordsSetting, limits) : null),
    [sample, recordsSetting, limits],
  );
  const records = sampleData?.ok ? sampleData.records : null;

  const structureIssues = useMemo<ConfigIssue[]>(() => {
    if (!deferred) return [];
    const parsed = MappingConfigSchema.safeParse(deferred);
    if (parsed.success) return [];
    return parsed.error.issues.map((issue) => ({ where: issue.path.join("."), message: issue.message, level: "blocking" }));
  }, [deferred]);
  const issues = useMemo(
    () => (deferred ? [...structureIssues, ...validateMappingConfig(deferred, schema)] : []),
    [deferred, structureIssues],
  );

  const preview = useMemo(() => {
    if (!deferred || !records || structureIssues.length > 0) return null;
    const compiled = compileMapping(deferred, schema);
    if (!compiled.ok) return null;
    return convertRecords(records.slice(0, PREVIEW_RECORD_LIMIT), compiled.compiled);
  }, [deferred, records, structureIssues]);

  if (load.state === "loading") return <p className="muted">불러오는 중…</p>;
  if (load.state === "error" || !config) {
    return (
      <section className="card">
        <h2>설정을 열 수 없습니다</h2>
        <p className="muted">{load.state === "error" ? load.message : ""}</p>
        <Link href="/mappings/" className="btn" style={{ marginTop: 12, display: "inline-block" }}>
          목록으로
        </Link>
      </section>
    );
  }

  const update = (fn: (current: MappingConfig) => MappingConfig) => setConfig((current) => (current ? fn(current) : current));
  const updateColumn = (mapping: ColumnMapping) =>
    update((current) => ({
      ...current,
      columns: current.columns.map((m) => (m.columnId === mapping.columnId ? mapping : m)),
    }));

  const onFile = async (file: File) => {
    setSampleError(null);
    if (file.size > MAX_SAMPLE_BYTES) {
      setSampleError(
        `샘플 파일이 너무 큽니다(${formatBytes(file.size)}). 매핑 설정에는 ${formatBytes(MAX_SAMPLE_BYTES)} 이하의 대표 샘플을 쓰고, 전체 파일은 대량 변환에서 처리하세요.`,
      );
      return;
    }
    const parsed = parseSample(await file.text());
    if (!parsed.ok) {
      setSampleError(parsed.message);
      return;
    }
    setSample({ fileName: file.name, size: file.size, root: parsed.root, candidates: parsed.candidates });
    // 레코드 위치가 아직 기본값(최상위)인데 후보에 없으면 가장 유력한 후보를 고른다. 사용자가 바꿀 수 있다.
    const best = parsed.candidates[0];
    const current = config.records;
    const listed = parsed.candidates.some(
      (c) => c.mode === current.mode && JSON.stringify(c.path) === JSON.stringify(current.path),
    );
    if (!listed && best) update((c) => ({ ...c, records: { mode: best.mode, path: best.path } }));
  };

  const save = async (status: MappingConfig["status"]) => {
    if (status === "ready" && issues.length > 0) {
      setMessage({ tone: "error", text: "아래 문제를 해결해야 사용 가능 설정으로 저장할 수 있습니다." });
      return;
    }
    setSaving(true);
    const toSave: MappingConfig = { ...config, status, updatedAt: nowIso() };
    const result = await saveMapping(toSave, schema);
    setSaving(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    void requestPersistentStorage();
    loadedId.current = toSave.id;
    if (status === "ready") {
      // 사용 가능 버전은 고정한다. 이후 수정은 다음 버전 작성 중으로 이어간다.
      const next = nextDraftVersion(toSave, nowIso());
      setConfig(next);
      setSaved(JSON.stringify(next));
      setFromReady(toSave.version);
      setMessage({
        tone: "info",
        text: `v${toSave.version}을(를) 사용 가능 설정으로 저장했습니다. 대량 변환에서 선택할 수 있습니다. 이어서 수정하면 v${toSave.version + 1} 작성 중으로 저장됩니다.`,
      });
    } else {
      setConfig(toSave);
      setSaved(JSON.stringify(toSave));
      setMessage({ tone: "info", text: `작성 중 v${toSave.version}을(를) 저장했습니다.` });
    }
    if (id !== toSave.id) router.replace(`/mappings/edit/?id=${encodeURIComponent(toSave.id)}`);
  };

  const fields = sampleData?.ok ? sampleData.profile.fields : null;
  const ctx = { fields, sampled: records?.length ?? 0, explodePath: config.explode?.path };
  const selectedIndex = schema.columns.findIndex((c) => c.id === selectedId);
  const selectedColumn = schema.columns[selectedIndex];
  const selectedMapping = config.columns.find((m) => m.columnId === selectedId)!;
  const blocking = issues.filter((issue) => issue.level === "blocking");

  return (
    <>
      <section className={`card ${styles.header}`}>
        <div className={styles.headerMain}>
          <input
            className={styles.nameInput}
            type="text"
            value={config.name}
            aria-label="설정 이름"
            onChange={(event) => update((c) => ({ ...c, name: event.target.value }))}
          />
          <div className="row">
            <span className={styles.versionTag}>v{config.version}</span>
            <span className={styles.statusTag}>{config.status === "ready" ? "사용 가능" : "작성 중"}</span>
            {dirty && <span className={styles.dirty}>저장하지 않은 변경</span>}
            {schema.isDemo && <span className={styles.demoTag}>데모 스키마</span>}
          </div>
        </div>
        <div className="row">
          <Link href="/mappings/" className="btn">
            목록
          </Link>
          <button type="button" className="btn" onClick={() => downloadText(mappingFileName(config), exportMappingJson(config))}>
            내보내기
          </button>
          <button type="button" className="btn" onClick={() => save("draft")} disabled={saving || config.name.trim() === ""}>
            작성 중 저장
          </button>
          <button type="button" className="btn btn-primary" onClick={() => save("ready")} disabled={saving || issues.length > 0}>
            사용 가능으로 저장
          </button>
        </div>
      </section>

      {fromReady !== undefined && (
        <p className="notice">
          사용 가능 v{fromReady}은(는) 바뀌지 않습니다. 지금 수정한 내용은 v{config.version} 작성 중으로 저장됩니다.
        </p>
      )}
      {message && (
        <p className={message.tone === "error" ? styles.errorBox : styles.infoBox} role="status">
          {message.text}
        </p>
      )}

      <ol className={styles.progress}>
        <li className={sample ? styles.done : undefined}>샘플 선택</li>
        <li className={sampleData?.ok ? styles.done : undefined}>구조 분석</li>
        <li className={issues.length === 0 ? styles.done : undefined}>매핑 검토</li>
        <li className={preview && preview.errors.length === 0 ? styles.done : undefined}>샘플 결과</li>
        <li className={config.status === "ready" || fromReady !== undefined ? styles.done : undefined}>저장</li>
      </ol>

      <SampleSection
        sample={sample}
        sampleError={sampleError}
        sampleData={sampleData}
        config={config}
        onFile={onFile}
        onRecordsChange={(recordsValue) => update((c) => ({ ...c, records: recordsValue }))}
        onLimitsChange={(stringJson) => update((c) => ({ ...c, stringJson }))}
      />

      <ExplodeSettings config={config} fields={fields} onChange={(explode) => update((c) => ({ ...c, explode }))} />

      <section className="card">
        <h2>3. 매핑 검토</h2>
        <p className="muted" style={{ fontSize: "0.85rem", marginBottom: 8 }}>
          CSV 컬럼 이름과 순서는 고정입니다. 행을 눌러 입력 경로와 변환 규칙을 설정하세요.
        </p>
        <div className={styles.mappingGrid}>
          <MappingTable
            schema={schema}
            config={config}
            records={records}
            issues={issues}
            preview={preview}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <ColumnDetail
            key={selectedId}
            column={selectedColumn}
            columnIndex={selectedIndex}
            mapping={selectedMapping}
            config={config}
            records={records}
            preview={preview}
            ctx={ctx}
            onChange={updateColumn}
          />
        </div>
      </section>

      <section className="card">
        <h2>4. 샘플 결과</h2>
        {!sample && <p className="muted">샘플을 불러오면 변환 결과를 미리 볼 수 있습니다.</p>}
        {sample && !preview && blocking.length > 0 && (
          <p className={styles.errorText}>설정 문제 때문에 미리보기를 만들 수 없습니다. 아래 &lsquo;저장 전 확인&rsquo;을 보세요.</p>
        )}
        {preview && (
          <>
            <p className={styles.summary}>
              샘플 앞 {preview.stats.sourceRecords}건 → 정상 {preview.stats.outputRows}행 · 오류 레코드 {preview.stats.failedRecords}건 · 제외
              행 {preview.stats.failedRows}행 · 오류 {preview.errors.length}건
            </p>
            <ResultTable
              headers={schema.columns.map((c) => c.header)}
              columnIds={schema.columns.map((c) => c.id)}
              rows={preview.rows}
              errors={preview.errors}
              sourceLabel={`샘플 앞 ${preview.stats.sourceRecords}건에서 만든 결과`}
            />
            <p className="muted" style={{ fontSize: "0.8rem" }}>
              샘플 결과가 정상이어도 전체 데이터가 정상이라는 보장은 아닙니다. 대량 변환에서도 레코드마다 같은 규칙으로 다시 검증합니다.
            </p>
          </>
        )}
      </section>

      <CsvSettings
        config={config}
        onCsvChange={(csv) => update((c) => ({ ...c, csv }))}
        onErrorModeChange={(errorMode) => update((c) => ({ ...c, errorMode }))}
      />

      <section className="card">
        <h2>저장 전 확인</h2>
        {issues.length === 0 ? (
          <p className={styles.okText}>설정 문제가 없습니다. 사용 가능 설정으로 저장할 수 있습니다.</p>
        ) : (
          <ul className={styles.issues}>
            {issues.map((issue, i) => (
              <li key={i} className={issue.level === "blocking" ? styles.errorText : styles.warn}>
                <strong>{issue.where}</strong>: {issue.message}
              </li>
            ))}
          </ul>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => save("draft")} disabled={saving || config.name.trim() === ""}>
            작성 중 저장
          </button>
          <button type="button" className="btn btn-primary" onClick={() => save("ready")} disabled={saving || issues.length > 0}>
            사용 가능으로 저장
          </button>
        </div>
      </section>
    </>
  );
}
