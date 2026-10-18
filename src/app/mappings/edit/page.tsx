import type { Metadata } from "next";
import { Suspense } from "react";
import { MappingEditor } from "@/components/MappingEditor/MappingEditor";

export const metadata: Metadata = { title: "매핑 설정 편집 — Map Flow" };

/**
 * 정적 export에서는 동적 경로를 쓸 수 없어 ?id=…, ?demo=1 쿼리로 설정을 고른다.
 * useSearchParams는 클라이언트에서만 값이 정해지므로 Suspense로 감싼다.
 */
export default function MappingEditPage() {
  return (
    <Suspense fallback={<p className="muted">불러오는 중…</p>}>
      <MappingEditor />
    </Suspense>
  );
}
