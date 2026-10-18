import type { Metadata } from "next";
import { demoSchema } from "@/schemas/load";

export const metadata: Metadata = { title: "매핑 설정 — Map Flow" };

export default function MappingsPage() {
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>매핑 설정</h1>
        <div className="row">
          <button type="button" className="btn" disabled>
            가져오기
          </button>
          <button type="button" className="btn btn-primary" disabled>
            새 설정 만들기
          </button>
          <span className="pending">준비 중</span>
        </div>
      </div>

      <p className="notice">
        매핑 설정은 이 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 설정이 사라질 수 있으니 내보내기로 백업해 두세요.
      </p>

      <section className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
        <h2>저장된 매핑 설정이 없습니다</h2>
        <p className="muted" style={{ marginBottom: 16 }}>
          샘플 JSON으로 새 설정을 만들거나, 데모 샘플로 흐름을 먼저 확인해 보세요.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button type="button" className="btn" disabled>
            데모로 시작하기
          </button>
          <button type="button" className="btn btn-primary" disabled>
            새 설정 만들기
          </button>
        </div>
        <p className="muted" style={{ marginTop: 12, fontSize: "0.85rem" }}>
          설정 편집 화면은 다음 단계에서 제공됩니다.
        </p>
      </section>

      <section className="card">
        <h2>출력 CSV 양식</h2>
        <p className="muted" style={{ marginBottom: 8 }}>
          {demoSchema.name} v{demoSchema.version} · {demoSchema.rowDescription}
        </p>
        <ol style={{ paddingLeft: 20 }}>
          {demoSchema.columns.map((column) => (
            <li key={column.id}>
              <strong>{column.header}</strong>{" "}
              <span className="muted">
                ({column.type}
                {column.required ? ", 필수" : ""}) — {column.description}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
