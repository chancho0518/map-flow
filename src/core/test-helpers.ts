import { compileMapping, convertDocument, type CompiledMapping, type ConversionResult } from "@/core/engine/convert";
import type { ColumnMapping, MappingConfig, Policy } from "@/core/mapping/config";
import { demoSchema } from "@/schemas/load";

const BLANK: Policy = { action: "blank" };
const ERROR: Policy = { action: "error" };

/** 테스트용 컬럼 매핑. 지정하지 않은 정책은 선택 컬럼이면 빈칸, 필수 컬럼이면 오류 */
export function column(columnId: string, partial: Partial<ColumnMapping> = {}): ColumnMapping {
  const required = demoSchema.columns.find((c) => c.id === columnId)?.required ?? false;
  const fallback = required ? ERROR : BLANK;
  return {
    columnId,
    source: { kind: "blank" },
    steps: [],
    whenMissing: fallback,
    whenNull: fallback,
    whenEmpty: fallback,
    onError: ERROR,
    ...partial,
  };
}

/** 데모 스키마 전체 컬럼을 채운 기본 설정. 필수 컬럼은 id/name 경로에 연결된다. */
export function makeConfig(overrides: Partial<MappingConfig> = {}, columns: ColumnMapping[] = []): MappingConfig {
  const base: ColumnMapping[] = demoSchema.columns.map((c) => {
    if (c.id === "customerNo") return column(c.id, { source: { kind: "path", scope: "record", path: ["id"] } });
    if (c.id === "customerName") return column(c.id, { source: { kind: "path", scope: "record", path: ["name"] } });
    return column(c.id);
  });
  for (const override of columns) {
    base[base.findIndex((c) => c.columnId === override.columnId)] = override;
  }
  return {
    formatVersion: 1,
    id: "test",
    name: "테스트",
    version: 1,
    status: "draft",
    outputSchema: { id: demoSchema.id, version: demoSchema.version },
    records: { mode: "array", path: [] },
    stringJson: { maxDepth: 2, maxStringLength: 1_000_000 },
    columns: base,
    csv: { bom: false, lineEnding: "LF", delimiter: ",", formulaPolicy: "escape" },
    errorMode: "partial",
    createdAt: "2026-10-17T00:00:00+09:00",
    updatedAt: "2026-10-17T00:00:00+09:00",
    ...overrides,
  };
}

export function compile(config: MappingConfig): CompiledMapping {
  const result = compileMapping(config, demoSchema);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.compiled;
}

export function run(input: unknown, config: MappingConfig): ConversionResult {
  return convertDocument(typeof input === "string" ? input : JSON.stringify(input), compile(config));
}

/** 특정 컬럼의 셀 값 목록 */
export function cellsOf(result: ConversionResult, columnId: string): string[] {
  const index = demoSchema.columns.findIndex((c) => c.id === columnId);
  return result.rows.map((row) => row.cells[index]);
}
