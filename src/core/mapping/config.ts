import { z } from "zod";

/**
 * 매핑 설정(실행 가능한 규칙). 설정 파일 내보내기/가져오기와 저장에 쓰인다.
 * 구조 검증은 이 Zod 스키마가, 출력 스키마와의 의미 검증은 validate.ts가 맡는다.
 * AI 근거나 샘플 원본 값은 포함하지 않는다.
 */

export const MAPPING_FORMAT_VERSION = 1;

export const PathStepSchema = z.union([
  z.string(),
  z.int().nonnegative(),
  z.strictObject({ decode: z.literal("json") }),
]);
export const PathSchema = z.array(PathStepSchema);

/** record: 원본 레코드 기준, item: 행 펼치기 배열 항목 기준 */
export const ScopeSchema = z.enum(["record", "item"]);

export const PathRefSchema = z.strictObject({
  kind: z.literal("path"),
  scope: ScopeSchema,
  path: PathSchema,
});

const LiteralPartSchema = z.strictObject({ kind: z.literal("literal"), value: z.string() });

const SelectSchema = z.discriminatedUnion("by", [
  z.strictObject({ by: z.literal("index"), index: z.int().nonnegative() }),
  /** 항목의 field 값(표준 텍스트)이 equals와 같은 항목 */
  z.strictObject({ by: z.literal("match"), field: PathSchema, equals: z.string() }),
]);

export const SourceSchema = z.discriminatedUnion("kind", [
  /** 아직 연결하지 않음(작성 중 설정에서만 허용) */
  z.strictObject({ kind: z.literal("unmapped") }),
  PathRefSchema,
  z.strictObject({ kind: z.literal("constant"), value: z.string() }),
  /** 명시적 빈칸 */
  z.strictObject({ kind: z.literal("blank") }),
  /** 우선순위 필드: 값이 있는(누락·null·빈 문자열이 아닌) 첫 경로 */
  z.strictObject({ kind: z.literal("firstOf"), sources: z.array(PathRefSchema).min(2) }),
  /** 문자열 결합 */
  z.strictObject({
    kind: z.literal("concat"),
    parts: z.array(z.discriminatedUnion("kind", [PathRefSchema, LiteralPartSchema])).min(1),
    separator: z.string(),
    /** true면 누락·null·빈 값 부분을 건너뛴다. false면 그런 부분이 있을 때 오류 */
    skipEmpty: z.boolean(),
  }),
  /** 배열에서 항목 하나 선택 */
  z.strictObject({
    kind: z.literal("pick"),
    scope: ScopeSchema,
    arrayPath: PathSchema,
    select: SelectSchema,
    valuePath: PathSchema,
    /** 일치 항목이 없을 때: missing이면 누락 정책 적용, error면 오류 */
    onNone: z.enum(["missing", "error"]),
    /** 조건 일치 항목이 여럿일 때 */
    onMany: z.enum(["first", "error"]),
  }),
  /** 배열 요소를 구분자로 결합해 셀 하나로 */
  z.strictObject({
    kind: z.literal("join"),
    scope: ScopeSchema,
    arrayPath: PathSchema,
    valuePath: PathSchema,
    separator: z.string(),
    /** true면 누락·null 요소를 건너뛴다. false면 오류 */
    skipMissing: z.boolean(),
  }),
]);

const OffsetSchema = z.string().regex(/^[+-](0\d|1[0-4]):[0-5]\d$/, "+09:00 형식의 고정 오프셋이어야 합니다.");

export const DATE_INPUT_FORMATS = ["YYYY-MM-DD", "YYYYMMDD", "YYYY/MM/DD", "YYYY.MM.DD"] as const;

export const StepSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("trim") }),
  z.strictObject({
    op: z.literal("mapCode"),
    entries: z.array(z.strictObject({ from: z.string(), to: z.string() })).min(1),
    /** 표에 없는 값: keep(원본 유지) | blank(빈칸) | error */
    onUnknown: z.enum(["keep", "blank", "error"]),
  }),
  z.strictObject({
    op: z.literal("date"),
    input: z.discriminatedUnion("kind", [
      /** 날짜만 있는 값. 시간대 변환을 하지 않는다. */
      z.strictObject({ kind: z.literal("date"), format: z.enum(DATE_INPUT_FORMATS) }),
      /** ISO 8601 시각. 값에 오프셋이 없으면 assumeOffset을 쓰고, 그것도 없으면 오류 */
      z.strictObject({ kind: z.literal("timestamp"), assumeOffset: OffsetSchema.optional() }),
    ]),
    /** timestamp를 날짜로 바꿀 기준 오프셋 */
    outputOffset: OffsetSchema,
  }),
  z.strictObject({
    op: z.literal("boolean"),
    /** 표준 텍스트 기준 비교. JSON true/false는 그대로 통과 */
    trueValues: z.array(z.string()).min(1),
    falseValues: z.array(z.string()).min(1),
  }),
]);

export const PolicySchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("blank") }),
  /** 기본값은 변환 단계를 거치지 않고 출력 형식 검증만 받는다. */
  z.strictObject({ action: z.literal("default"), value: z.string() }),
  z.strictObject({ action: z.literal("error") }),
]);

export const ColumnMappingSchema = z.strictObject({
  columnId: z.string(),
  source: SourceSchema,
  steps: z.array(StepSchema),
  whenMissing: PolicySchema,
  whenNull: PolicySchema,
  whenEmpty: PolicySchema,
  /** 경로 구조 불일치·문자열 JSON 손상·변환 실패·형식 오류 */
  onError: PolicySchema,
});

export const MappingConfigSchema = z.strictObject({
  formatVersion: z.literal(MAPPING_FORMAT_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.int().positive(),
  status: z.enum(["draft", "ready"]),
  outputSchema: z.strictObject({ id: z.string(), version: z.int().positive() }),
  records: z.strictObject({
    /** array: 경로의 배열 항목 각각이 레코드, single: 경로의 객체 하나가 레코드 */
    mode: z.enum(["array", "single"]),
    path: PathSchema,
  }),
  stringJson: z.strictObject({
    maxDepth: z.int().min(1).max(5),
    maxStringLength: z.int().positive(),
  }),
  /** 행 펼치기: 레코드당 배열 하나. 여러 배열 동시 펼치기는 지원하지 않는다. */
  explode: z
    .strictObject({
      path: PathSchema,
      /** 빈 배열(또는 누락·null): skipRecord(행 없음) | blankRow(항목 값 없이 한 행) | error */
      onEmpty: z.enum(["skipRecord", "blankRow", "error"]),
    })
    .optional(),
  columns: z.array(ColumnMappingSchema),
  csv: z.strictObject({
    bom: z.boolean(),
    lineEnding: z.enum(["CRLF", "LF"]),
    delimiter: z.enum([",", ";", "\t"]),
    /** escape: = + - @ 탭 CR로 시작하는 문자열 셀 앞에 ' 추가, keep: 그대로 */
    formulaPolicy: z.enum(["escape", "keep"]),
  }),
  /** partial: 정상 행만 CSV + 오류 보고, strict: 오류가 하나라도 있으면 실패 */
  errorMode: z.enum(["partial", "strict"]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

/** 행 펼치기 배열 항목을 참조하는 소스인지 */
export function usesItemScope(source: Source): boolean {
  switch (source.kind) {
    case "path":
    case "pick":
    case "join":
      return source.scope === "item";
    case "firstOf":
      return source.sources.some((ref) => ref.scope === "item");
    case "concat":
      return source.parts.some((part) => part.kind === "path" && part.scope === "item");
    default:
      return false;
  }
}

export type PathRef = z.infer<typeof PathRefSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;
export type MappingConfig = z.infer<typeof MappingConfigSchema>;
export type CsvOptions = MappingConfig["csv"];
export type DateInputFormat = (typeof DATE_INPUT_FORMATS)[number];
