import Link from "next/link";
import { demoSchema } from "@/schemas/load";

export default function Home() {
  return (
    <>
      <h1>JSON → 고정 CSV 변환</h1>
      <p className="muted">
        서로 다른 구조의 JSON을 하나의 고정된 CSV 양식으로 변환합니다. 작업은 두 단계로 나뉩니다.
      </p>

      <section className="card">
        <h2>1. 매핑 설정</h2>
        <p className="muted">
          입력 구조마다 한 번만 합니다. 샘플 JSON을 분석해 CSV 컬럼과 연결하고, 샘플 결과를 확인한 뒤 규칙을 저장합니다.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <Link href="/mappings/" className="btn btn-primary">
            매핑 설정으로
          </Link>
        </div>
      </section>

      <section className="card">
        <h2>2. 대량 변환</h2>
        <p className="muted">
          반복 작업입니다. 저장된 규칙을 골라 실제 JSON 파일을 넣으면 그 규칙 그대로 전체를 변환합니다. 이 단계에서는 AI를 사용하지 않습니다.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <Link href="/conversion/" className="btn">
            대량 변환으로
          </Link>
        </div>
      </section>

      {demoSchema.isDemo && (
        <p className="notice">
          현재 출력 양식은 개발용 데모({demoSchema.name} v{demoSchema.version}, {demoSchema.columns.length}개 컬럼)입니다. 실제 고객 CSV 양식이 아닙니다.
        </p>
      )}
    </>
  );
}
