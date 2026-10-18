# Map Flow — JSON → 고정 CSV 변환

서로 다른 구조의 JSON을 하나의 고정된 CSV 양식으로 변환하는 브라우저 앱입니다.
요구사항과 전체 계획은 로컬 문서 `docs/JSON_to_CSV_Claude_Code_Plan.md`를 따릅니다(저장소에는 포함하지 않음).

작업은 두 단계로 나뉩니다.

1. **매핑 설정**: 샘플 분석 → 연결 → 샘플 검증 → 규칙 저장 (입력 구조마다 한 번)
2. **대량 변환**: 저장된 규칙으로 실제 파일 전체 변환 (반복 작업, AI 호출 없음)

## 현재 상태

| 마일스톤 | 상태 |
|---|---|
| M1 프로젝트·데모 규격 | 완료 |
| M2 수동 변환 엔진 | 완료 (코어 + 테스트, 화면 연결 전) |
| M3 매핑 설정 화면·저장 | 완료 |
| M4 별칭·AI 추천 | 미구현 |
| M5 대량 변환 화면 | 미구현 — 화면은 안내만 표시 |
| M6 스트리밍·대용량 검증·배포 | 미구현 (정적 빌드만 확인, 실제 배포 안 함) |

### 매핑 설정 화면에서 할 수 있는 것 (M3)

- 목록: 이름·최신 버전·상태(작성 중/사용 가능)·사용 가능 버전·수정일. 편집, 복제, 내보내기, 삭제(해당 설정의 모든 버전만), 가져오기, 전체 백업.
- 데모로 시작하기: 데모 샘플(fixture B)과 데모 매핑을 작성 중 설정으로 엽니다.
- 편집(`/mappings/edit/?id=…`):
  1. 샘플 JSON 선택(최대 20MB, 브라우저 안에서만 처리) → 레코드 목록 후보 선택. 파일 전체 건수·분석 건수(앞 500건)·미리보기 건수(앞 100건)를 따로 표시합니다. 문자열 JSON 해석 내역·해석 실패·타입 혼재도 보여줍니다.
  2. 배열 규칙: 행 펼치기 배열 하나 선택, 빈 배열 정책.
  3. 매핑 표(CSV 컬럼·입력 경로·원본 예시·변환 규칙·결과 예시·상태)와 상세 패널(경로 검색·선택, 소스 종류, 변환 단계, 누락/null/빈 값/오류 정책, 여러 원본·결과 예시).
  4. 샘플 결과 테이블: 헤더 고정, 가로 스크롤, 오류만 보기, 셀 상세, 실제 표시 범위 표시.
  5. CSV·오류 처리 옵션, 저장 전 확인 목록.
- 저장: 작성 중 저장은 언제나 가능합니다. 사용 가능 저장은 문제 목록이 비어 있어야 합니다. 사용 가능 버전은 고정되고, 이후 수정은 다음 버전 작성 중으로 저장됩니다.
- 샘플 원본은 저장하지 않습니다. 기존 설정을 다시 편집할 때는 샘플을 다시 선택하세요.
- 컬럼 상태는 미연결 / 빈칸(명시) / 확인 필요(설정 문제나 샘플 오류) / 사용자 설정입니다. 별칭·AI 추천 출처 표시는 M4에서 추가합니다.

## 실행

Node.js 22 이상과 npm이 필요합니다. Docker는 필요 없습니다.

```bash
npm install
npm run dev         # 개발 서버 http://localhost:3000
npm test            # 단위·fixture 테스트 (Vitest)
npm run typecheck   # TypeScript 검사
npm run lint
npm run build       # 정적 export → out/
npm run preview     # out/ 정적 서버로 확인
```

## 배포 (Cloudflare Pages)

서버 기능 없이 `output: "export"`로 정적 파일만 만듭니다.

- 빌드 명령: `npm run build`
- 출력 디렉터리: `out`
- `trailingSlash: true`로 페이지마다 `경로/index.html`을 만들기 때문에 `/mappings/`에서 새로고침해도 동작합니다. `_redirects`는 필요 없습니다.

정적 export에서는 API Routes, Server Actions, middleware, `cacheComponents`(PPR)를 쓸 수 없습니다. Next.js 16.4에서 `cacheComponents`를 켜면 "PPR cannot be enabled in export mode" 오류로 빌드가 실패해서 꺼 두었습니다. 파일 읽기, IndexedDB, Worker 같은 브라우저 API는 클라이언트 컴포넌트의 effect 안에서만 사용해야 합니다(빌드 시 프리렌더 단계에는 없음).

## 구조

```
src/
  app/                 화면(App Router): /, /mappings, /mappings/edit, /conversion
  components/          UI 컴포넌트 (업무 로직 없음)
  storage/             IndexedDB 설정 저장소(버전별), 내보내기·가져오기·백업
  lib/                 브라우저 유틸(ID, 다운로드)
  schemas/             고정 출력 스키마 (demo-schema.json + Zod 검증)
  fixtures/            합성 입력·매핑·기대 CSV·기대 오류 (A~D)
  core/                Next/React와 무관한 순수 TS — 미리보기·대량 변환 공용
    json/              정규화 값 표현 (숫자는 원문 보존)
    parsing/           lossless JSON 파싱, 문자열 JSON 해석(깊이·크기 제한)
    paths/             토큰 배열 경로, 안전한 탐색, 표시 형식
    records/           레코드 목록 선택·후보 탐색
    profiling/         필드 프로파일(매핑 화면용 후보)
    mapping/           매핑 설정 Zod 스키마 + 의미 검증
    transforms/        등록된 변환 단계, 날짜, 출력 형식 검증
    engine/            소스 해석(경로·우선순위·결합·배열 선택·셀 결합), convertRecord
    preview/           샘플 분석, 경로 후보, 원본 예시, 표 요약(편집 화면용)
    csv/               CSV 직렬화, 수식 위험값 정책
    errors/            오류 코드·구조
```

미리보기와 전체 변환은 같은 `convertRecord`를 씁니다. 실행 시작 시 `compileMapping`이 설정을 깊은 복사해 고정하므로, 실행 중 설정을 바꿔도 진행 중인 작업에는 영향이 없습니다.

## 매핑 설정 형식 요약

전체 정의는 [src/core/mapping/config.ts](src/core/mapping/config.ts)에 있고, 예시는 `src/fixtures/*/mapping.json`입니다.

- `records`: `{ mode: "array" | "single", path }`
- `explode`(선택): 레코드 안 배열 **하나**를 행으로 펼침. 빈 배열 정책 `skipRecord | blankRow | error`. 여러 배열을 동시에 펼치는 기능은 지원하지 않습니다.
- `columns[]`: 출력 컬럼마다 하나씩
  - `source`: `unmapped | path | constant | blank | firstOf | concat | pick | join`
  - `steps`: `trim | mapCode | date | boolean` (등록된 단계만, 순서대로 실행)
  - `whenMissing / whenNull / whenEmpty / onError`: `blank | default | error`
- 경로는 토큰 배열입니다. `["info", "a.b", 0, {"decode": "json"}, "name"]` → 화면 표시 `info["a.b"][0](JSON).name`
- `csv`: BOM, CRLF/LF, 구분자, 수식 위험값 정책
- `errorMode`: `partial`(정상 행만 CSV + 오류 목록) | `strict`(오류가 하나라도 있으면 성공 파일 없음)

## 처리 정책 (구현 기준)

- **숫자**: JS Number로 바꾸지 않고 원문 그대로 둡니다. 큰 정수 ID도 손실이 없고, 지수 표기(`1e3`)는 정수·소수 컬럼에서 오류로 처리합니다.
- **문자열**: 숫자나 `true`처럼 보여도 타입을 바꾸지 않습니다. 참/거짓은 `boolean` 단계에서 명시한 값만 변환합니다.
- **문자열 JSON**: 경로에 `decode` 단계를 둔 곳에서만 해석합니다. 이미 객체면 그대로 쓰고, null이면 null로 둡니다. 이중 인코딩은 `maxDepth`까지 풉니다. 관련 없는 필드가 손상돼도 그 레코드를 제외하지 않습니다.
- **missing / null / 빈 문자열**: 각각 다른 정책과 오류 코드를 씁니다. 0과 false는 값입니다. 경로 중간 값이 null이면 그 아래는 missing으로 봅니다.
- **기본값**: 변환 단계를 거치지 않고 출력 형식 검증만 거칩니다.
- **중복 키**: 같은 객체 안에 값이 다른 중복 키가 있으면 JSON 오류로 처리합니다.
- **`__proto__` 등 키**: 일반 키로 읽습니다. 프로토타입 오염이 없습니다. 설정 가져오기는 알 수 없는 키를 거부합니다.
- **날짜**: 날짜만 있는 값(`date`)과 시각(`timestamp`)을 구분합니다. 형식뿐 아니라 실제 달력으로도 검사합니다(2026-02-30 오류). 시각에 오프셋이 없으면 `assumeOffset`이 있어야 합니다. 시간대는 `+09:00` 같은 고정 오프셋만 지원합니다(IANA 시간대 이름·서머타임 미지원).
- **구조값**: 객체나 배열을 셀에 암묵적으로 문자열화하지 않습니다. `pick`/`join`/`explode`로 명시해야 합니다.
- **수식 위험값**(`escape`): `= + - @ 탭 CR`로 시작하는 **문자열 컬럼** 값 앞에 `'`를 붙입니다. 그래서 `+82-10-...`은 `'+82-10-...`이 되어 **원문이 바뀝니다**. 정수·소수 컬럼은 검증된 숫자만 오므로 바꾸지 않습니다. 원문 유지가 필요하면 `keep`을 쓰세요.
- **엑셀**: CSV에는 셀 자료형이 없어서, 더블클릭으로 열면 엑셀이 앞자리 0을 지울 수 있습니다. 데이터 → 텍스트/CSV 가져오기에서 해당 열을 "텍스트"로 지정해야 합니다.

## 실제 CSV 양식으로 교체하기

1. `src/schemas/demo-schema.json`을 실제 스키마로 교체합니다. 컬럼 순서가 CSV 순서입니다. `isDemo: false`로 바꾸고, 양식이 바뀌면 `version`을 올립니다.
2. 스키마는 `src/schemas/load.ts`에서 Zod로 검증합니다. 잘못되면 빌드·테스트가 바로 실패합니다.
3. `src/fixtures/`의 데모 fixture를 실제 샘플(입력 JSON, 매핑, 기대 CSV, 기대 오류)로 교체하고 `src/fixtures/fixtures.test.ts`의 `FIXTURES` 목록을 갱신합니다.
4. `npm test`로 전체 흐름을 다시 검증합니다.

다른 스키마 ID나 버전으로 만든 매핑 설정은 자동으로 적용되지 않습니다.

## 검증 결과

- 단위·fixture·저장소 테스트 91개 통과(`npm test`, 저장소는 fake-indexeddb). 지시서 §14 중 1~11, 14, 16번 시나리오를 다룹니다.
- 화면(M3)은 개발 서버에서 모든 페이지가 오류 없이 응답하는 것까지 확인했습니다. 브라우저 조작 자동 테스트는 아직 없습니다.
  - 15번(취소·디스크 쓰기 실패)은 M5~M6에서 추가합니다. 파일 끝 JSON 손상은 포함했습니다.
  - 12·13번(AI)은 M4~M5에서 추가합니다.
- `npm run typecheck`, `npm run lint`, `npm run build` 통과. `out/`에 `/`, `/mappings/`, `/mappings/edit/`, `/conversion/` 생성.
- 성능·대용량: 아직 측정하지 않았습니다. 현재 엔진은 문서 전체를 메모리에 올려 처리하며(미리보기·테스트용), 스트리밍 입력·출력과 레코드 크기 제한은 M6 범위입니다.

## 업무 적용 전에 확정할 사항

- 실제 고정 CSV 헤더·컬럼 의미, CSV 한 행의 기준과 배열 처리 방식
- 서로 다른 JSON 샘플 3~5개와 각각의 기대 CSV
- 예상 최대 파일 크기·레코드 수, 주 사용 브라우저·PC 사양
- 수식 위험값 정책(`escape`/`keep`)과 엑셀 사용 방식
- 로컬 AI만 허용할지, 최소 정보의 외부 추론을 허용할지
