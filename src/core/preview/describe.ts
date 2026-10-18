import type { ConversionError } from "@/core/errors/errors";
import type { ColumnMapping, Policy, Source, Step } from "@/core/mapping/config";
import type { ConfigIssue } from "@/core/mapping/validate";
import { formatPath, type Path } from "@/core/paths/path";

const scopeLabel = (scope: "record" | "item") => (scope === "item" ? "항목." : "");

function ref(scope: "record" | "item", path: Path): string {
  return scopeLabel(scope) + formatPath(path);
}

/** 매핑 표 "입력 경로" 칸 */
export function describeSource(source: Source): string {
  switch (source.kind) {
    case "unmapped":
      return "—";
    case "blank":
      return "빈칸";
    case "constant":
      return `고정값 "${source.value}"`;
    case "path":
      return ref(source.scope, source.path);
    case "firstOf":
      return source.sources.map((s) => ref(s.scope, s.path)).join(" → ");
    case "concat":
      return source.parts.map((p) => (p.kind === "literal" ? `"${p.value}"` : ref(p.scope, p.path))).join(" + ");
    case "pick": {
      const select =
        source.select.by === "index"
          ? `[${source.select.index}]`
          : `[${formatPath(source.select.field)}="${source.select.equals}"]`;
      return `${ref(source.scope, source.arrayPath)}${select}.${formatPath(source.valuePath)}`;
    }
    case "join":
      return `${ref(source.scope, source.arrayPath)}[*].${formatPath(source.valuePath)} 결합("${source.separator}")`;
  }
}

export const SOURCE_KIND_LABEL: Record<Source["kind"], string> = {
  unmapped: "미연결",
  path: "경로",
  constant: "고정값",
  blank: "빈칸",
  firstOf: "우선순위 필드",
  concat: "문자열 결합",
  pick: "배열 항목 선택",
  join: "배열 셀 결합",
};

export const STEP_LABEL: Record<Step["op"], string> = {
  trim: "앞뒤 공백 제거",
  mapCode: "코드 치환",
  date: "날짜 변환",
  boolean: "참/거짓 변환",
};

/** 매핑 표 "변환 규칙" 칸 */
export function describeSteps(steps: Step[]): string {
  if (steps.length === 0) return "원본 유지";
  return steps.map((step) => STEP_LABEL[step.op]).join(" → ");
}

export function describePolicy(policy: Policy): string {
  if (policy.action === "blank") return "빈칸";
  if (policy.action === "error") return "오류";
  return `기본값 "${policy.value}"`;
}

export type ColumnStatus = "unmapped" | "blank" | "review" | "configured";

export const COLUMN_STATUS_LABEL: Record<ColumnStatus, string> = {
  unmapped: "미연결",
  blank: "빈칸(명시)",
  review: "확인 필요",
  configured: "사용자 설정",
};

/**
 * 컬럼 상태. 추천 출처(별칭·AI)는 M4에서 추가한다.
 * 샘플 미리보기 오류나 설정 문제가 있으면 "확인 필요".
 */
export function columnStatus(
  mapping: ColumnMapping,
  header: string,
  issues: ConfigIssue[],
  previewErrors: ConversionError[],
): ColumnStatus {
  if (mapping.source.kind === "unmapped") return "unmapped";
  const hasIssue = issues.some((issue) => issue.where === header);
  const hasError = previewErrors.some((error) => error.columnId === mapping.columnId);
  if (hasIssue || hasError) return "review";
  if (mapping.source.kind === "blank") return "blank";
  return "configured";
}
