import { MappingConfigSchema, type MappingConfig } from "@/core/mapping/config";
import { isRunnable, validateMappingConfig } from "@/core/mapping/validate";
import type { OutputSchema } from "@/schemas/output-schema";

/**
 * 매핑 설정 저장소(IndexedDB). 이 브라우저에만 저장되며 서버로 보내지 않는다.
 * - 키: [id, version]. 같은 설정의 여러 버전을 보관한다.
 * - 사용 가능(ready) 버전은 바꾸지 않는다. 수정은 다음 버전의 작성 중 설정으로 저장한다.
 * - 샘플 원본은 저장하지 않는다.
 */

const DB_NAME = "map-flow";
const DB_VERSION = 1;
const STORE = "mappings";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("이 브라우저에서는 IndexedDB를 사용할 수 없어 설정을 저장할 수 없습니다."));
  }
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: ["id", "version"] });
        store.createIndex("byId", "id");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error("저장소를 열 수 없습니다."));
    };
  });
  return dbPromise;
}

/** 테스트용: 열린 연결을 닫고 다음 호출에서 다시 연다. */
export async function resetStoreConnection(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("저장이 취소되었습니다. 저장 공간이 부족할 수 있습니다."));
  });
}

/** 저장소 값도 신뢰하지 않고 구조를 다시 검증한다(손상·구버전 데이터 제외). */
function readValid(values: unknown[]): MappingConfig[] {
  const configs: MappingConfig[] = [];
  for (const value of values) {
    const parsed = MappingConfigSchema.safeParse(value);
    if (parsed.success) configs.push(parsed.data);
  }
  return configs;
}

async function getAllVersions(id?: string): Promise<MappingConfig[]> {
  const db = await openDb();
  const store = db.transaction(STORE, "readonly").objectStore(STORE);
  const values = await wrap(id === undefined ? store.getAll() : store.index("byId").getAll(id));
  return readValid(values).sort((a, b) => a.version - b.version);
}

export interface MappingSummary {
  id: string;
  /** 가장 최근 버전(작성 중일 수 있음) */
  latest: MappingConfig;
  /** 사용 가능 버전 번호들(오름차순) */
  readyVersions: number[];
}

export async function listMappings(): Promise<MappingSummary[]> {
  const byId = new Map<string, MappingConfig[]>();
  for (const config of await getAllVersions()) {
    const list = byId.get(config.id) ?? [];
    list.push(config);
    byId.set(config.id, list);
  }
  return [...byId.entries()]
    .map(([id, versions]) => ({
      id,
      latest: versions[versions.length - 1],
      readyVersions: versions.filter((v) => v.status === "ready").map((v) => v.version),
    }))
    .sort((a, b) => b.latest.updatedAt.localeCompare(a.latest.updatedAt));
}

export async function getMappingVersions(id: string): Promise<MappingConfig[]> {
  return getAllVersions(id);
}

export async function getLatestMapping(id: string): Promise<MappingConfig | undefined> {
  const versions = await getAllVersions(id);
  return versions[versions.length - 1];
}

export async function getMapping(id: string, version: number): Promise<MappingConfig | undefined> {
  return (await getAllVersions(id)).find((config) => config.version === version);
}

export type SaveResult = { ok: true } | { ok: false; message: string };

/**
 * 설정 저장.
 * - 같은 [id, version]이 이미 사용 가능이면 거부한다.
 * - 사용 가능으로 저장하려면 출력 스키마 기준 문제가 없어야 한다.
 */
export async function saveMapping(config: MappingConfig, schema: OutputSchema): Promise<SaveResult> {
  const parsed = MappingConfigSchema.safeParse(config);
  if (!parsed.success) return { ok: false, message: "설정 구조가 올바르지 않습니다." };
  if (config.status === "ready" && !isRunnable(validateMappingConfig(config, schema))) {
    return { ok: false, message: "해결되지 않은 문제가 있어 사용 가능 설정으로 저장할 수 없습니다." };
  }

  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const existing = await wrap(store.get([config.id, config.version]));
  const previous = MappingConfigSchema.safeParse(existing);
  if (previous.success && previous.data.status === "ready") {
    tx.abort();
    return { ok: false, message: `v${config.version}은 이미 사용 가능 버전이라 변경할 수 없습니다. 새 버전으로 저장하세요.` };
  }
  store.put(parsed.data);
  try {
    await done(tx);
  } catch (error) {
    return { ok: false, message: `저장에 실패했습니다: ${error instanceof Error ? error.message : String(error)}` };
  }
  return { ok: true };
}

/** 해당 설정의 모든 버전을 삭제한다. 다른 설정은 그대로 둔다. */
export async function deleteMapping(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const keys = await wrap(store.index("byId").getAllKeys(id));
  for (const key of keys) store.delete(key);
  await done(tx);
}

/** 작성 중 버전만 삭제한다(사용 가능 버전은 남긴다). */
export async function deleteDraftVersion(id: string, version: number): Promise<SaveResult> {
  const existing = await getMapping(id, version);
  if (!existing) return { ok: true };
  if (existing.status === "ready") return { ok: false, message: "사용 가능 버전은 삭제할 수 없습니다." };
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete([id, version]);
  await done(tx);
  return { ok: true };
}

export interface ImportResult {
  added: MappingConfig[];
  /** 백업 복원 시 이미 같은 ID·버전이 있어 건너뛴 수 */
  skipped: number;
  errors: string[];
}

/**
 * 가져온 설정 저장.
 * - single: 기존 설정과 섞이지 않도록 새 ID, 버전 1로 추가한다.
 * - backup: ID·버전을 유지해 복원하고, 이미 있는 버전은 덮어쓰지 않고 건너뛴다.
 */
export async function importMappings(
  configs: MappingConfig[],
  kind: "single" | "backup",
  schema: OutputSchema,
  makeId: () => string,
  now: string,
): Promise<ImportResult> {
  const result: ImportResult = { added: [], skipped: 0, errors: [] };
  for (const original of configs) {
    let config = original;
    if (kind === "single") {
      config = { ...original, id: makeId(), version: 1, createdAt: now, updatedAt: now };
    } else if (await getMapping(original.id, original.version)) {
      result.skipped++;
      continue;
    }
    const saved = await saveMapping(config, schema);
    if (saved.ok) result.added.push(config);
    else result.errors.push(`${config.name} v${config.version}: ${saved.message}`);
  }
  return result;
}

/** 영구 저장 요청(브라우저가 공간 부족 시 임의로 지우지 않도록). 지원·허용 여부만 알려준다. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}
