"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FilePicker } from "@/components/FilePicker/FilePicker";
import { duplicateConfig } from "@/core/mapping/factory";
import { downloadText, formatDateTime, newId, nowIso } from "@/lib/browser";
import { demoSchema } from "@/schemas/load";
import {
  deleteMapping,
  getMappingVersions,
  importMappings,
  listMappings,
  saveMapping,
  type MappingSummary,
} from "@/storage/mapping-store";
import { exportBackupJson, exportMappingJson, mappingFileName, parseImportFile } from "@/storage/transfer";
import styles from "./MappingList.module.css";

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; items: MappingSummary[] };

interface Message {
  tone: "info" | "error";
  text: string;
}

export function MappingList() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [message, setMessage] = useState<Message | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoad({ state: "ready", items: await listMappings() });
    } catch (error) {
      setLoad({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  useEffect(() => {
    // 마운트 시 저장소에서 목록을 읽는다(외부 시스템 동기화).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const onDuplicate = async (summary: MappingSummary) => {
    const copy = duplicateConfig(summary.latest, newId(), nowIso());
    const result = await saveMapping(copy, demoSchema);
    setMessage(result.ok ? { tone: "info", text: `'${copy.name}'을(를) 만들었습니다.` } : { tone: "error", text: result.message });
    await refresh();
  };

  const onDelete = async (summary: MappingSummary) => {
    const count = summary.readyVersions.length;
    const extra = count > 0 ? ` 사용 가능 버전 ${count}개도 함께 삭제됩니다.` : "";
    if (!window.confirm(`'${summary.latest.name}' 설정의 모든 버전을 삭제할까요?${extra} 되돌릴 수 없습니다.`)) return;
    await deleteMapping(summary.id);
    setMessage({ tone: "info", text: `'${summary.latest.name}'을(를) 삭제했습니다.` });
    await refresh();
  };

  const onExport = (summary: MappingSummary) => {
    downloadText(mappingFileName(summary.latest), exportMappingJson(summary.latest));
  };

  const onBackup = async () => {
    if (load.state !== "ready") return;
    const all = (await Promise.all(load.items.map((item) => getMappingVersions(item.id)))).flat();
    downloadText(`map-flow-backup-${nowIso().slice(0, 10)}.json`, exportBackupJson(all, nowIso()));
  };

  const onImport = async (file: File) => {
    const parsed = parseImportFile(await file.text(), demoSchema);
    if (!parsed.ok) {
      setMessage({ tone: "error", text: `가져올 수 없습니다.\n${parsed.message}` });
      return;
    }
    const result = await importMappings(
      parsed.configs.map((item) => item.config),
      parsed.kind,
      demoSchema,
      newId,
      nowIso(),
    );
    const lines = [`${result.added.length}개 설정을 가져왔습니다.`];
    if (result.skipped > 0) lines.push(`이미 있는 버전 ${result.skipped}개는 건너뛰었습니다.`);
    const downgraded = parsed.configs.filter((item) => item.downgraded).length;
    if (downgraded > 0) lines.push(`문제가 있는 ${downgraded}개는 '작성 중'으로 가져왔습니다.`);
    if (parsed.failures.length > 0) lines.push(`검증에 실패한 ${parsed.failures.length}개는 가져오지 않았습니다.`);
    lines.push(...result.errors);
    setMessage({ tone: parsed.failures.length > 0 || result.errors.length > 0 ? "error" : "info", text: lines.join("\n") });
    await refresh();
  };

  const items = load.state === "ready" ? load.items : [];

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>매핑 설정</h1>
        <div className="row">
          <FilePicker label="가져오기" onFile={onImport} />
          <button type="button" className="btn" onClick={onBackup} disabled={items.length === 0}>
            전체 백업
          </button>
          <Link href="/mappings/edit/" className="btn btn-primary">
            새 설정 만들기
          </Link>
        </div>
      </div>

      <p className="notice">
        매핑 설정은 이 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 설정이 사라질 수 있으니 &lsquo;전체 백업&rsquo;으로 파일을
        보관해 두세요. 내보낸 파일에는 매핑 규칙만 들어가고 샘플 원본 값은 들어가지 않습니다.
      </p>

      {message && (
        <p className={message.tone === "error" ? styles.error : styles.info} role="status">
          {message.text}
        </p>
      )}

      {load.state === "loading" && <p className="muted">불러오는 중…</p>}
      {load.state === "error" && <p className={styles.error}>설정을 불러올 수 없습니다: {load.message}</p>}

      {load.state === "ready" && items.length === 0 && (
        <section className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <h2>저장된 매핑 설정이 없습니다</h2>
          <p className="muted" style={{ marginBottom: 16 }}>
            샘플 JSON으로 새 설정을 만들거나, 데모 샘플과 설정으로 흐름을 먼저 확인해 보세요.
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link href="/mappings/edit/?demo=1" className="btn">
              데모로 시작하기
            </Link>
            <Link href="/mappings/edit/" className="btn btn-primary">
              새 설정 만들기
            </Link>
          </div>
        </section>
      )}

      {items.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>이름</th>
                <th>최신 버전</th>
                <th>상태</th>
                <th>사용 가능 버전</th>
                <th>수정일</th>
                <th aria-label="작업" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/mappings/edit/?id=${encodeURIComponent(item.id)}`} className={styles.name}>
                      {item.latest.name}
                    </Link>
                  </td>
                  <td>v{item.latest.version}</td>
                  <td>
                    <span className={item.latest.status === "ready" ? styles.ready : styles.draft}>
                      {item.latest.status === "ready" ? "사용 가능" : "작성 중"}
                    </span>
                  </td>
                  <td className="muted">
                    {item.readyVersions.length > 0 ? item.readyVersions.map((v) => `v${v}`).join(", ") : "없음"}
                  </td>
                  <td className="muted">{formatDateTime(item.latest.updatedAt)}</td>
                  <td>
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      <Link href={`/mappings/edit/?id=${encodeURIComponent(item.id)}`} className="btn">
                        편집
                      </Link>
                      <button type="button" className="btn" onClick={() => onDuplicate(item)}>
                        복제
                      </button>
                      <button type="button" className="btn" onClick={() => onExport(item)}>
                        내보내기
                      </button>
                      <button type="button" className="btn btn-danger" onClick={() => onDelete(item)}>
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {items.length > 0 && (
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          사용 가능 버전은 바뀌지 않습니다. 편집하면 다음 버전이 작성 중으로 만들어지고, 대량 변환은 사용 가능 버전을 골라 실행합니다.{" "}
          <Link href="/mappings/edit/?demo=1" className={styles.link}>
            데모 다시 열기
          </Link>
        </p>
      )}
    </>
  );
}
