import type { OutputColumn, OutputSchema } from "@/schemas/output-schema";
import { MAPPING_FORMAT_VERSION, type ColumnMapping, type MappingConfig, type Policy } from "./config";

/** 컬럼 기본 정책: 필수는 모두 오류, 선택은 누락·null·빈 값을 빈칸으로 */
export function defaultColumnMapping(column: OutputColumn): ColumnMapping {
  const empty: Policy = column.required ? { action: "error" } : { action: "blank" };
  return {
    columnId: column.id,
    source: { kind: "unmapped" },
    steps: [],
    whenMissing: empty,
    whenNull: empty,
    whenEmpty: empty,
    onError: { action: "error" },
  };
}

export function createEmptyConfig(schema: OutputSchema, id: string, name: string, now: string): MappingConfig {
  return {
    formatVersion: MAPPING_FORMAT_VERSION,
    id,
    name,
    version: 1,
    status: "draft",
    outputSchema: { id: schema.id, version: schema.version },
    records: { mode: "array", path: [] },
    stringJson: { maxDepth: 2, maxStringLength: 1_000_000 },
    columns: schema.columns.map(defaultColumnMapping),
    csv: { bom: true, lineEnding: "CRLF", delimiter: ",", formulaPolicy: "escape" },
    errorMode: "partial",
    createdAt: now,
    updatedAt: now,
  };
}

/** 다른 설정으로 복제: 새 ID, 버전 1, 작성 중 */
export function duplicateConfig(config: MappingConfig, id: string, now: string): MappingConfig {
  return {
    ...structuredClone(config),
    id,
    name: `${config.name} (복사본)`,
    version: 1,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

/** 사용 가능 버전을 수정할 때: 같은 ID의 다음 버전을 작성 중으로 만든다(기존 버전은 그대로). */
export function nextDraftVersion(config: MappingConfig, now: string): MappingConfig {
  return { ...structuredClone(config), version: config.version + 1, status: "draft", updatedAt: now };
}

/** 스키마 순서대로 컬럼 매핑을 맞추고, 빠진 컬럼은 미연결로 채운다. */
export function alignColumns(config: MappingConfig, schema: OutputSchema): MappingConfig {
  const columns = schema.columns.map(
    (column) => config.columns.find((mapping) => mapping.columnId === column.id) ?? defaultColumnMapping(column),
  );
  return { ...config, columns };
}
