import { z } from "zod";
import { type MappingConfig } from "@/core/mapping/config";
import { isRunnable, parseMappingConfig, type ConfigIssue } from "@/core/mapping/validate";
import type { OutputSchema } from "@/schemas/output-schema";

/**
 * 설정 파일 내보내기/가져오기.
 * 내보내기에는 매핑 규칙만 들어가며 샘플 원본 값은 포함하지 않는다.
 */

export const BACKUP_KIND = "map-flow-backup";

const BackupSchema = z.strictObject({
  kind: z.literal(BACKUP_KIND),
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  mappings: z.array(z.unknown()),
});

export function mappingFileName(config: MappingConfig): string {
  const safe = config.name.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60) || "mapping";
  return `${safe}-v${config.version}.mapping.json`;
}

export function exportMappingJson(config: MappingConfig): string {
  return JSON.stringify(config, null, 2);
}

export function exportBackupJson(configs: MappingConfig[], now: string): string {
  return JSON.stringify({ kind: BACKUP_KIND, formatVersion: 1, exportedAt: now, mappings: configs }, null, 2);
}

export interface ImportedConfig {
  config: MappingConfig;
  /** 사용 가능으로 가져왔다가 문제가 있어 작성 중으로 바꾼 경우 */
  downgraded: boolean;
  issues: ConfigIssue[];
}

export interface ImportFailure {
  index: number;
  issues: ConfigIssue[];
}

export type ImportParse =
  | { ok: true; kind: "single" | "backup"; configs: ImportedConfig[]; failures: ImportFailure[] }
  | { ok: false; message: string };

/**
 * 가져올 파일을 검사한다. 단일 설정 또는 전체 백업 파일을 받는다.
 * 구조·지원 버전·출력 스키마·경로·변환 규칙을 검사하고, 문제가 남은 사용 가능 설정은 작성 중으로 낮춘다.
 */
export function parseImportFile(text: string, schema: OutputSchema): ImportParse {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: "JSON 파일이 아닙니다." };
  }

  const backup = BackupSchema.safeParse(data);
  const kind = backup.success ? "backup" : "single";
  const items = backup.success ? backup.data.mappings : [data];

  const configs: ImportedConfig[] = [];
  const failures: ImportFailure[] = [];
  items.forEach((item, index) => {
    const parsed = parseMappingConfig(item, schema);
    if (!parsed.ok) {
      failures.push({ index, issues: parsed.issues });
      return;
    }
    const runnable = isRunnable(parsed.issues);
    const downgraded = parsed.config.status === "ready" && !runnable;
    configs.push({
      config: downgraded ? { ...parsed.config, status: "draft" } : parsed.config,
      downgraded,
      issues: parsed.issues,
    });
  });

  if (kind === "single" && configs.length === 0) {
    return { ok: false, message: failures[0]?.issues.map((i) => `${i.where}: ${i.message}`).join("\n") ?? "가져올 수 없습니다." };
  }
  return { ok: true, kind, configs, failures };
}
