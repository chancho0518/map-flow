import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { duplicateConfig, nextDraftVersion } from "@/core/mapping/factory";
import { column, makeConfig } from "@/core/test-helpers";
import { demoSchema } from "@/schemas/load";
import {
  deleteMapping,
  getLatestMapping,
  getMapping,
  importMappings,
  listMappings,
  resetStoreConnection,
  saveMapping,
} from "./mapping-store";
import { exportBackupJson, exportMappingJson, parseImportFile } from "./transfer";

const NOW = "2026-10-18T00:00:00.000Z";

beforeEach(async () => {
  await resetStoreConnection();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("map-flow");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

describe("설정 저장소", () => {
  it("작성 중 저장 → 다시 읽기", async () => {
    const config = makeConfig({ id: "a", name: "설정 A" });
    expect(await saveMapping(config, demoSchema)).toEqual({ ok: true });
    expect(await getLatestMapping("a")).toEqual(config);
  });

  it("문제가 남은 설정은 사용 가능으로 저장할 수 없다", async () => {
    const config = makeConfig({ id: "a", status: "ready" }, [column("memo", { source: { kind: "unmapped" } })]);
    expect((await saveMapping(config, demoSchema)).ok).toBe(false);
  });

  it("사용 가능 버전은 변경할 수 없고, 수정은 다음 버전으로 저장된다", async () => {
    const v1 = makeConfig({ id: "a", status: "ready" });
    expect((await saveMapping(v1, demoSchema)).ok).toBe(true);
    expect((await saveMapping({ ...v1, name: "바꿈", status: "draft" }, demoSchema)).ok).toBe(false);

    const v2 = { ...nextDraftVersion(v1, NOW), name: "v2 작업" };
    expect((await saveMapping(v2, demoSchema)).ok).toBe(true);
    expect((await getMapping("a", 1))?.name).toBe(v1.name);

    const [summary] = await listMappings();
    expect(summary.latest.version).toBe(2);
    expect(summary.latest.status).toBe("draft");
    expect(summary.readyVersions).toEqual([1]);
  });

  it("삭제는 해당 설정만 지우고 다른 설정은 보존한다", async () => {
    await saveMapping(makeConfig({ id: "a" }), demoSchema);
    await saveMapping(makeConfig({ id: "b" }), demoSchema);
    await saveMapping(duplicateConfig(makeConfig({ id: "a" }), "c", NOW), demoSchema);
    await deleteMapping("a");
    expect((await listMappings()).map((s) => s.id).sort()).toEqual(["b", "c"]);
  });

  it("손상된 저장 값은 목록에서 제외한다", async () => {
    await saveMapping(makeConfig({ id: "a" }), demoSchema);
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("map-flow", 1);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("mappings", "readwrite");
      tx.objectStore("mappings").put({ id: "broken", version: 1, junk: true });
      tx.oncomplete = () => resolve();
    });
    db.close();
    expect((await listMappings()).map((s) => s.id)).toEqual(["a"]);
  });
});

describe("내보내기·가져오기", () => {
  it("단일 설정 왕복: 새 ID로 추가되고 규칙은 그대로다", async () => {
    const original = makeConfig({ id: "orig", status: "ready" });
    const parsed = parseImportFile(exportMappingJson(original), demoSchema);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await importMappings(parsed.configs.map((c) => c.config), parsed.kind, demoSchema, () => "new-id", NOW);
    expect(result.added).toHaveLength(1);
    const saved = await getLatestMapping("new-id");
    expect(saved?.columns).toEqual(original.columns);
    expect(saved?.status).toBe("ready");
  });

  it("백업 복원: ID·버전 유지, 이미 있는 버전은 건너뛴다", async () => {
    const a1 = makeConfig({ id: "a", status: "ready" });
    const a2 = nextDraftVersion(a1, NOW);
    await saveMapping(a1, demoSchema);
    const parsed = parseImportFile(exportBackupJson([a1, a2], NOW), demoSchema);
    if (!parsed.ok) throw new Error(parsed.message);
    expect(parsed.kind).toBe("backup");
    const result = await importMappings(parsed.configs.map((c) => c.config), parsed.kind, demoSchema, () => "x", NOW);
    expect(result.skipped).toBe(1);
    expect(result.added.map((c) => c.version)).toEqual([2]);
  });

  it("출력 스키마 버전이 다른 설정은 가져오지 않는다", () => {
    const other = makeConfig({ outputSchema: { id: "demo-customer", version: 9 } });
    const parsed = parseImportFile(exportMappingJson(other), demoSchema);
    expect(parsed.ok).toBe(false);
  });

  it("문제가 남은 사용 가능 설정은 작성 중으로 낮춰 가져온다", () => {
    const config = makeConfig({ status: "ready" }, [column("customerNo", { source: { kind: "unmapped" } })]);
    const parsed = parseImportFile(exportMappingJson(config), demoSchema);
    if (!parsed.ok) throw new Error(parsed.message);
    expect(parsed.configs[0]).toMatchObject({ downgraded: true, config: { status: "draft" } });
  });

  it("JSON이 아니거나 구조가 틀린 파일은 거부한다", () => {
    expect(parseImportFile("not json", demoSchema).ok).toBe(false);
    expect(parseImportFile('{"hello": 1}', demoSchema).ok).toBe(false);
  });
});
