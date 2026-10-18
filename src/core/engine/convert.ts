import { applyFormulaPolicy, serializeCsv } from "@/core/csv/csv";
import { fail, type ConversionError, type ValueFailure } from "@/core/errors/errors";
import { isScalar, KIND_LABEL, kindOf, type JsonValue } from "@/core/json/value";
import { usesItemScope, type ColumnMapping, type MappingConfig, type Policy, type Source } from "@/core/mapping/config";
import { validateMappingConfig, type ConfigIssue } from "@/core/mapping/validate";
import { parseJsonText } from "@/core/parsing/parse-json";
import { formatPath, resolvePath, type Path } from "@/core/paths/path";
import { selectRecords } from "@/core/records/records";
import { runSteps } from "@/core/transforms/steps";
import { configValueToScalar, formatCellValue } from "@/core/transforms/format";
import type { OutputColumn, OutputSchema } from "@/schemas/output-schema";
import { resolveSource, type SourceContext } from "./source";

interface CompiledColumn {
  index: number;
  column: OutputColumn;
  mapping: ColumnMapping;
  itemScoped: boolean;
}

/**
 * 실행용으로 고정된 매핑. 실행 시작 시 한 번 만들고, 이후 설정이 바뀌어도
 * 이 객체로 처리하는 작업에는 영향이 없다(깊은 복사본을 보관).
 */
export interface CompiledMapping {
  readonly config: MappingConfig;
  readonly schema: OutputSchema;
  readonly headers: string[];
  readonly columns: CompiledColumn[];
  /** 사용 가능 저장을 막는 문제(작성 중 미리보기에서는 실행은 하되 해당 컬럼이 오류가 된다) */
  readonly issues: ConfigIssue[];
}

export type CompileResult = { ok: true; compiled: CompiledMapping } | { ok: false; issues: ConfigIssue[] };

export function compileMapping(config: MappingConfig, schema: OutputSchema): CompileResult {
  const issues = validateMappingConfig(config, schema);
  if (issues.some((issue) => issue.level === "blocking")) return { ok: false, issues };

  const frozen = structuredClone(config);
  const columns = schema.columns.map((column, index): CompiledColumn => {
    const mapping: ColumnMapping = frozen.columns.find((candidate) => candidate.columnId === column.id) ?? {
      columnId: column.id,
      source: { kind: "unmapped" },
      steps: [],
      whenMissing: { action: "error" },
      whenNull: { action: "error" },
      whenEmpty: { action: "error" },
      onError: { action: "error" },
    };
    return { index, column, mapping, itemScoped: usesItemScope(mapping.source) };
  });

  return {
    ok: true,
    compiled: { config: frozen, schema, headers: schema.columns.map((column) => column.header), columns, issues },
  };
}

export interface OutputRow {
  recordIndex: number;
  /** 행 펼치기 항목 인덱스(펼치기 없음·빈 배열 행이면 없음) */
  itemIndex?: number;
  /** CSV에 쓰일 값 그대로. 실패한 셀은 빈 문자열 */
  cells: string[];
  failed: boolean;
}

export interface RecordResult {
  rows: OutputRow[];
  errors: ConversionError[];
}

type CellResult = { ok: true; text: string } | { ok: false; failure: ValueFailure };

/** 원본 레코드 하나를 출력 행(0개 이상)으로 바꾼다. 미리보기와 전체 변환이 같은 함수를 쓴다. */
export function convertRecord(record: JsonValue, recordIndex: number, compiled: CompiledMapping): RecordResult {
  const { config } = compiled;
  const limits = config.stringJson;
  const errors: ConversionError[] = [];
  const recordError = (failure: ValueFailure): RecordResult => ({
    rows: [],
    errors: [{ recordIndex, ...failure }],
  });

  const kind = kindOf(record);
  if (kind !== "object") {
    return recordError(fail("RECORD_NOT_OBJECT", `레코드가 객체가 아니라 ${KIND_LABEL[kind]}입니다.`));
  }

  // 행 펼치기 대상 항목
  let items: { value: JsonValue | undefined; index?: number }[] = [{ value: undefined }];
  let explodeBase: Path = [];
  if (config.explode) {
    explodeBase = config.explode.path;
    const resolved = resolvePath(record, config.explode.path, limits);
    if (resolved.kind === "error") return recordError(resolved.failure);
    const value = resolved.kind === "missing" ? null : resolved.value;
    if (value !== null && kindOf(value) !== "array") {
      return recordError(
        fail("EXPLODE_NOT_ARRAY", `행 펼치기 대상이 배열이 아니라 ${KIND_LABEL[kindOf(value)]}입니다.`, formatPath(explodeBase)),
      );
    }
    const array = (value ?? []) as JsonValue[];
    if (array.length === 0) {
      if (config.explode.onEmpty === "skipRecord") return { rows: [], errors: [] };
      if (config.explode.onEmpty === "error") {
        return recordError(fail("EXPLODE_EMPTY", "행 펼치기 대상 배열이 비어 있습니다.", formatPath(explodeBase)));
      }
      items = [{ value: undefined }];
    } else {
      items = array.map((item, index) => ({ value: item, index }));
    }
  }

  // 레코드 기준 컬럼은 레코드당 한 번만 계산하고 오류도 한 번만 기록한다.
  const recordCtx: SourceContext = { record, item: undefined, itemBase: [], limits };
  const recordCells = new Map<number, CellResult>();
  for (const cc of compiled.columns) {
    if (cc.itemScoped) continue;
    const cell = evaluateColumn(cc, recordCtx, config);
    recordCells.set(cc.index, cell);
    if (!cell.ok) errors.push({ recordIndex, columnId: cc.column.id, ...cell.failure });
  }
  const recordFailed = [...recordCells.values()].some((cell) => !cell.ok);

  const rows: OutputRow[] = [];
  for (const item of items) {
    const ctx: SourceContext = {
      record,
      item: item.value,
      itemBase: item.index === undefined ? explodeBase : [...explodeBase, item.index],
      limits,
    };
    let failed = recordFailed;
    const cells = compiled.columns.map((cc) => {
      const cell = cc.itemScoped ? evaluateColumn(cc, ctx, config) : recordCells.get(cc.index)!;
      if (!cell.ok) {
        failed = true;
        if (cc.itemScoped) {
          errors.push({
            recordIndex,
            ...(item.index === undefined ? {} : { itemIndex: item.index }),
            columnId: cc.column.id,
            ...cell.failure,
          });
        }
        return "";
      }
      return cell.text;
    });
    rows.push({ recordIndex, ...(item.index === undefined ? {} : { itemIndex: item.index }), cells, failed });
  }
  return { rows, errors };
}

function evaluateColumn(cc: CompiledColumn, ctx: SourceContext, config: MappingConfig): CellResult {
  const { column, mapping } = cc;
  const where = sourceLabel(mapping.source, ctx.itemBase);
  const withPath = (failure: ValueFailure): ValueFailure =>
    failure.path === undefined && where !== undefined ? { ...failure, path: where } : failure;

  const finish = (result: CellResult): CellResult =>
    result.ok ? { ok: true, text: applyFormulaPolicy(result.text, column.type, config.csv.formulaPolicy) } : result;

  if (mapping.source.kind === "blank") return { ok: true, text: "" };

  const source = resolveSource(mapping.source, ctx);
  if (source.state === "error") return finish(applyPolicy(mapping.onError, withPath(source.failure), column));
  if (source.state === "missing") {
    return finish(applyPolicy(mapping.whenMissing, withPath(fail("VALUE_MISSING", "값이 없습니다.")), column));
  }
  const value = source.value;
  if (value === null) return finish(applyPolicy(mapping.whenNull, withPath(fail("VALUE_NULL", "값이 null입니다.")), column));
  if (!isScalar(value)) {
    const failure = fail("STRUCTURED_VALUE", `${KIND_LABEL[kindOf(value)]} 값은 셀 하나에 쓸 수 없습니다. 하위 경로나 배열 규칙을 선택하세요.`);
    return finish(applyPolicy(mapping.onError, withPath(failure), column));
  }
  if (value === "") return finish(applyPolicy(mapping.whenEmpty, withPath(fail("VALUE_EMPTY", "빈 문자열입니다.")), column));

  const stepped = runSteps(value, mapping.steps);
  if (!stepped.ok) return finish(applyPolicy(mapping.onError, withPath(stepped.failure), column));
  if (stepped.value === "") {
    return finish(applyPolicy(mapping.whenEmpty, withPath(fail("VALUE_EMPTY", "변환 결과가 빈 문자열입니다.")), column));
  }

  const formatted = formatCellValue(stepped.value, column);
  if (!formatted.ok) return finish(applyPolicy(mapping.onError, withPath(formatted.failure), column));
  return finish(formatted);
}

/** 정책 적용. 기본값은 변환 단계 없이 출력 형식 검증만 거친다. */
function applyPolicy(policy: Policy, failure: ValueFailure, column: OutputColumn): CellResult {
  if (policy.action === "blank") return { ok: true, text: "" };
  if (policy.action === "error") return { ok: false, failure };
  return formatCellValue(configValueToScalar(policy.value, column), column);
}

function sourceLabel(source: Source, itemBase: Path): string | undefined {
  const label = (scope: "record" | "item", path: Path) => formatPath(scope === "item" ? [...itemBase, ...path] : path);
  switch (source.kind) {
    case "path":
      return label(source.scope, source.path);
    case "pick":
    case "join":
      return label(source.scope, [...source.arrayPath]);
    case "firstOf":
      return source.sources.map((ref) => label(ref.scope, ref.path)).join(" | ");
    default:
      return undefined;
  }
}

export interface ConversionStats {
  /** 원본 레코드 수 */
  sourceRecords: number;
  /** CSV에 쓴 정상 행 수 */
  outputRows: number;
  /** 오류가 하나라도 있는 원본 레코드 수(일부 행만 실패한 레코드 포함) */
  failedRecords: number;
  /** 오류 때문에 CSV에서 제외한 출력 행 수 */
  failedRows: number;
}

export type ConversionStatus = "completed" | "completed_with_errors" | "failed";

export interface ConversionResult {
  status: ConversionStatus;
  stats: ConversionStats;
  headers: string[];
  /** 정상·실패 행 모두(미리보기용). CSV에는 정상 행만 들어간다. */
  rows: OutputRow[];
  errors: ConversionError[];
  /** 성공 파일로 쓸 수 있는 CSV. strict 모드에서 오류가 있거나 실패하면 null */
  csv: string | null;
}

/**
 * 메모리에 올린 문서 전체를 변환한다(샘플 미리보기·테스트용).
 * 대용량 스트리밍 변환도 레코드마다 같은 convertRecord를 사용한다.
 */
export function convertDocument(input: string | JsonValue, compiled: CompiledMapping): ConversionResult {
  const empty: ConversionStats = { sourceRecords: 0, outputRows: 0, failedRecords: 0, failedRows: 0 };
  const fatal = (failure: ValueFailure): ConversionResult => ({
    status: "failed",
    stats: empty,
    headers: compiled.headers,
    rows: [],
    errors: [{ recordIndex: -1, ...failure }],
    csv: null,
  });

  let root: JsonValue;
  if (typeof input === "string") {
    const parsed = parseJsonText(input);
    if (!parsed.ok) return fatal(fail("JSON_INVALID", `JSON 형식 오류: ${parsed.message}`));
    root = parsed.value;
  } else {
    root = input;
  }

  const selection = selectRecords(root, compiled.config.records, compiled.config.stringJson);
  if (!selection.ok) return fatal(selection.failure);
  return convertRecords(selection.records, compiled);
}

/** 이미 고른 레코드 목록을 변환한다(샘플 미리보기는 앞부분 레코드만 넘긴다). */
export function convertRecords(records: JsonValue[], compiled: CompiledMapping): ConversionResult {
  const rows: OutputRow[] = [];
  const errors: ConversionError[] = [];
  let failedRecords = 0;
  records.forEach((record, index) => {
    const result = convertRecord(record, index, compiled);
    rows.push(...result.rows);
    errors.push(...result.errors);
    if (result.errors.length > 0) failedRecords++;
  });

  const okRows = rows.filter((row) => !row.failed);
  const stats: ConversionStats = {
    sourceRecords: records.length,
    outputRows: okRows.length,
    failedRecords,
    failedRows: rows.length - okRows.length,
  };
  const strictFailed = compiled.config.errorMode === "strict" && errors.length > 0;
  return {
    status: strictFailed ? "failed" : errors.length > 0 ? "completed_with_errors" : "completed",
    stats,
    headers: compiled.headers,
    rows,
    errors,
    csv: strictFailed ? null : serializeCsv(compiled.headers, okRows.map((row) => row.cells), compiled.config.csv),
  };
}
