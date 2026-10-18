import type { OutputSchema } from "@/schemas/output-schema";
import { configValueToScalar, formatCellValue } from "@/core/transforms/format";
import { MappingConfigSchema, usesItemScope, type ColumnMapping, type MappingConfig, type Policy } from "./config";

export interface ConfigIssue {
  /** 문제 위치(설정 JSON 경로 또는 컬럼 ID) */
  where: string;
  message: string;
  /** blocking: 변환 실행 불가, notReady: 작성 중 저장은 가능하나 사용 가능 저장 불가 */
  level: "blocking" | "notReady";
}

export type ParseConfigResult =
  | { ok: true; config: MappingConfig; issues: ConfigIssue[] }
  | { ok: false; issues: ConfigIssue[] };

/** 설정 파일 가져오기: 구조(Zod) → 의미 검증 순서로 확인한다. */
export function parseMappingConfig(input: unknown, schema: OutputSchema): ParseConfigResult {
  const parsed = MappingConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        where: issue.path.join(".") || "(설정)",
        message: issue.message,
        level: "blocking",
      })),
    };
  }
  const issues = validateMappingConfig(parsed.data, schema);
  if (issues.some((issue) => issue.level === "blocking")) return { ok: false, issues };
  return { ok: true, config: parsed.data, issues };
}

/** 사용 가능(ready)으로 저장하거나 실행할 수 있는지 */
export function isRunnable(issues: ConfigIssue[]): boolean {
  return issues.length === 0;
}

/**
 * 출력 스키마 기준 의미 검증.
 * 스키마 ID·버전이 다르면 자동 적용하지 않는다(blocking).
 */
export function validateMappingConfig(config: MappingConfig, schema: OutputSchema): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const blocking = (where: string, message: string) => issues.push({ where, message, level: "blocking" });
  const notReady = (where: string, message: string) => issues.push({ where, message, level: "notReady" });

  if (config.outputSchema.id !== schema.id || config.outputSchema.version !== schema.version) {
    blocking(
      "outputSchema",
      `설정의 출력 스키마(${config.outputSchema.id} v${config.outputSchema.version})가 현재 스키마(${schema.id} v${schema.version})와 다릅니다. 자동으로 적용하지 않습니다.`,
    );
    return issues;
  }

  const byId = new Map<string, ColumnMapping>();
  config.columns.forEach((mapping, index) => {
    if (!schema.columns.some((column) => column.id === mapping.columnId)) {
      blocking(`columns.${index}`, `출력 스키마에 없는 컬럼입니다: ${mapping.columnId}`);
    } else if (byId.has(mapping.columnId)) {
      blocking(`columns.${index}`, `같은 컬럼이 두 번 설정되었습니다: ${mapping.columnId}`);
    } else {
      byId.set(mapping.columnId, mapping);
    }
  });

  for (const column of schema.columns) {
    const mapping = byId.get(column.id);
    const where = column.header;
    if (!mapping) {
      notReady(where, "매핑 설정이 없습니다.");
      continue;
    }

    if (mapping.source.kind === "unmapped") {
      if (column.required) notReady(where, "필수 컬럼이 연결되지 않았습니다.");
      else notReady(where, "연결하지 않을 선택 컬럼은 '빈칸'으로 명시해야 합니다.");
    }
    if (column.required && mapping.source.kind === "blank") {
      notReady(where, "필수 컬럼을 빈칸으로 둘 수 없습니다.");
    }

    if (usesItemScope(mapping.source) && !config.explode) {
      blocking(where, "배열 항목 기준 경로는 행 펼치기를 설정했을 때만 쓸 수 있습니다.");
    }

    const policies: [string, Policy][] = [
      ["whenMissing", mapping.whenMissing],
      ["whenNull", mapping.whenNull],
      ["whenEmpty", mapping.whenEmpty],
      ["onError", mapping.onError],
    ];
    for (const [name, policy] of policies) {
      if (column.required && policy.action === "blank") {
        notReady(where, `필수 컬럼의 ${name} 정책을 빈칸으로 둘 수 없습니다.`);
      }
      if (policy.action === "default") {
        const formatted = formatCellValue(configValueToScalar(policy.value, column), column);
        if (!formatted.ok) notReady(where, `${name} 기본값이 컬럼 형식에 맞지 않습니다: ${formatted.failure.message}`);
      }
    }

    if (mapping.source.kind === "constant") {
      const formatted = formatCellValue(configValueToScalar(mapping.source.value, column), column);
      if (!formatted.ok && mapping.steps.length === 0) {
        notReady(where, `고정값이 컬럼 형식에 맞지 않습니다: ${formatted.failure.message}`);
      }
    }

    for (const step of mapping.steps) {
      if (step.op === "mapCode") {
        const seen = new Set<string>();
        for (const entry of step.entries) {
          if (seen.has(entry.from)) notReady(where, `코드 치환 표에 같은 원본 값이 두 번 있습니다: ${entry.from}`);
          seen.add(entry.from);
        }
      }
      if (step.op === "boolean") {
        const overlap = step.trueValues.filter((value) => step.falseValues.includes(value));
        if (overlap.length > 0) notReady(where, `참/거짓 값 목록이 겹칩니다: ${overlap.join(", ")}`);
      }
    }
  }

  return issues;
}
