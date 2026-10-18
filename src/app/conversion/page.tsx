import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "대량 변환 — Map Flow" };

export default function ConversionPage() {
  return (
    <>
      <h1>대량 변환</h1>

      <section className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
        <h2>사용 가능한 매핑 설정이 없습니다</h2>
        <p className="muted" style={{ marginBottom: 16 }}>
          대량 변환은 &lsquo;사용 가능&rsquo; 상태로 저장된 매핑 설정이 있어야 시작할 수 있습니다.
        </p>
        <Link href="/mappings/" className="btn btn-primary">
          매핑 설정으로 이동
        </Link>
      </section>

      <section className="card">
        <h2>진행 순서</h2>
        <ol style={{ paddingLeft: 20 }} className="muted">
          <li>사용 가능한 매핑 설정과 버전 선택</li>
          <li>실제 JSON 파일 선택</li>
          <li>사전 검사</li>
          <li>전체 변환 (선택한 설정 버전으로 고정, AI 호출 없음)</li>
          <li>결과·오류 확인 후 CSV 다운로드</li>
        </ol>
        <p className="muted" style={{ marginTop: 12, fontSize: "0.85rem" }}>
          변환 중 이 탭을 닫으면 작업이 중단될 수 있습니다. <span className="pending">준비 중</span>
        </p>
      </section>
    </>
  );
}
