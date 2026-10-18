import { z } from "zod";

/**
 * 고정 CSV 출력 스키마.
 * columns 배열의 순서가 곧 CSV 컬럼 순서이며, 화면에서 바꿀 수 없다.
 */

export const COLUMN_TYPES = ["string", "integer", "decimal", "date", "boolean"] as const;

export const OutputColumnSchema = z.strictObject({
  /** 매핑 설정에서 컬럼을 가리키는 안정적인 식별자 */
  id: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/, "영문 소문자로 시작하는 식별자여야 합니다."),
  /** CSV 헤더에 그대로 쓰이는 이름 */
  header: z.string().min(1),
  description: z.string(),
  type: z.enum(COLUMN_TYPES),
  required: z.boolean(),
  /** 별칭 추천에 쓰는 입력 키 후보 */
  aliases: z.array(z.string().min(1)),
  /**
   * 출력 형식.
   * - date: "YYYY-MM-DD" | "YYYYMMDD"
   * - boolean: "Y/N" | "true/false" | "1/0"
   */
  format: z.string().optional(),
  allowedValues: z.array(z.string()).optional(),
});

export const OutputSchemaSchema = z
  .strictObject({
    id: z.string().min(1),
    version: z.int().positive(),
    name: z.string().min(1),
    /** 실제 고객 양식이 아닌 개발용 데모인지 */
    isDemo: z.boolean(),
    /** CSV 한 행이 무엇을 의미하는지 */
    rowDescription: z.string().min(1),
    columns: z.array(OutputColumnSchema).min(1),
  })
  .superRefine((schema, ctx) => {
    const ids = new Set<string>();
    const headers = new Set<string>();
    schema.columns.forEach((column, index) => {
      if (ids.has(column.id)) {
        ctx.addIssue({ code: "custom", path: ["columns", index, "id"], message: `컬럼 ID 중복: ${column.id}` });
      }
      if (headers.has(column.header)) {
        ctx.addIssue({ code: "custom", path: ["columns", index, "header"], message: `헤더 중복: ${column.header}` });
      }
      ids.add(column.id);
      headers.add(column.header);

      const format = column.format;
      if (column.type === "date" && format !== undefined && !DATE_OUTPUT_FORMATS.includes(format as DateOutputFormat)) {
        ctx.addIssue({ code: "custom", path: ["columns", index, "format"], message: `지원하지 않는 날짜 형식: ${format}` });
      }
      if (column.type === "boolean" && format !== undefined && !BOOLEAN_OUTPUT_FORMATS.includes(format as BooleanOutputFormat)) {
        ctx.addIssue({ code: "custom", path: ["columns", index, "format"], message: `지원하지 않는 참/거짓 형식: ${format}` });
      }
    });
  });

export const DATE_OUTPUT_FORMATS = ["YYYY-MM-DD", "YYYYMMDD"] as const;
export type DateOutputFormat = (typeof DATE_OUTPUT_FORMATS)[number];

export const BOOLEAN_OUTPUT_FORMATS = ["Y/N", "true/false", "1/0"] as const;
export type BooleanOutputFormat = (typeof BOOLEAN_OUTPUT_FORMATS)[number];

export type ColumnType = (typeof COLUMN_TYPES)[number];
export type OutputColumn = z.infer<typeof OutputColumnSchema>;
export type OutputSchema = z.infer<typeof OutputSchemaSchema>;

export function parseOutputSchema(input: unknown): OutputSchema {
  return OutputSchemaSchema.parse(input);
}
