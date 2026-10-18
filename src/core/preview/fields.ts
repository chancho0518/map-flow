import type { Path, PathStep } from "@/core/paths/path";
import type { FieldProfile, ProfileStep } from "@/core/profiling/profile";

/** 경로 선택기에 보여줄 후보 */
export interface FieldOption {
  /** 선택 시 설정에 들어갈 경로(기준 위치에서의 상대 경로) */
  path: Path;
  field: FieldProfile;
}

export const EACH: ProfileStep = { each: true };

function isEach(step: ProfileStep): step is { each: true } {
  return typeof step === "object" && "each" in step;
}

function startsWith(path: ProfileStep[], prefix: ProfileStep[]): boolean {
  if (path.length < prefix.length) return false;
  return prefix.every((step, i) => JSON.stringify(step) === JSON.stringify(path[i]));
}

/**
 * 기준 위치(base) 아래의 단일 값 경로 후보.
 * - 레코드 기준: base = []
 * - 행 펼치기 항목 기준: base = [...explodePath, EACH]
 * - 배열 항목 기준: base = [...scopeBase, ...arrayPath, EACH]
 */
export function optionsAt(fields: FieldProfile[], base: ProfileStep[]): FieldOption[] {
  const options: FieldOption[] = [];
  for (const field of fields) {
    if (!startsWith(field.path, base)) continue;
    const rest = field.path.slice(base.length);
    if (rest.length === 0 || rest.some(isEach)) continue;
    options.push({ path: rest as PathStep[], field });
  }
  return options;
}

export function recordFieldOptions(fields: FieldProfile[]): FieldOption[] {
  return optionsAt(fields, []);
}

/** 기준 위치 아래의 배열(행 펼치기·항목 선택·셀 결합 대상) */
export function arrayOptionsAt(fields: FieldProfile[], base: ProfileStep[]): FieldOption[] {
  return optionsAt(fields, base).filter((option) => (option.field.kinds.array ?? 0) > 0);
}

/** 소스 범위의 기준 위치 */
export function scopeBase(scope: "record" | "item", explodePath: Path | undefined): ProfileStep[] {
  return scope === "item" && explodePath ? [...explodePath, EACH] : [];
}

/** 이름·경로 검색 */
export function filterFieldOptions(options: FieldOption[], query: string): FieldOption[] {
  const q = query.trim().toLowerCase();
  if (q === "") return options;
  return options.filter((option) => option.field.display.toLowerCase().includes(q));
}
