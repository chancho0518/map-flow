import { describe, expect, it } from "vitest";
import { cellsOf, column, compile, makeConfig, run } from "@/core/test-helpers";
import { convertDocument } from "./convert";

const path = (...p: string[]) => ({ kind: "path" as const, scope: "record" as const, path: p });

describe("값 상태 구분: missing / null / 빈 문자열 / 0 / false", () => {
  const config = makeConfig({}, [
    column("points", {
      source: path("p"),
      whenMissing: { action: "default", value: "-1" },
      whenNull: { action: "default", value: "-2" },
      whenEmpty: { action: "default", value: "-3" },
    }),
    column("active", {
      source: path("a"),
      whenMissing: { action: "blank" },
      whenNull: { action: "error" },
      whenEmpty: { action: "error" },
    }),
  ]);
  const input = [
    { id: "1", name: "n", p: 0, a: false },
    { id: "2", name: "n" },
    { id: "3", name: "n", p: null, a: true },
    { id: "4", name: "n", p: "" },
  ];

  it("0과 false는 누락이 아니라 값이다", () => {
    const result = run(input, config);
    expect(cellsOf(result, "points")).toEqual(["0", "-1", "-2", "-3"]);
    // 데모 스키마의 활성여부 출력 형식은 Y/N
    expect(cellsOf(result, "active")).toEqual(["N", "", "Y", ""]);
    expect(result.errors).toEqual([]);
  });

  it("필수값 누락·null·빈 문자열은 각각 다른 오류 코드", () => {
    const result = run([{ id: "1" }, { id: "2", name: null }, { id: "3", name: "" }, { id: "4", name: 0 }], makeConfig());
    expect(result.errors.map((e) => [e.recordIndex, e.code])).toEqual([
      [0, "VALUE_MISSING"],
      [1, "VALUE_NULL"],
      [2, "VALUE_EMPTY"],
    ]);
    expect(result.stats).toEqual({ sourceRecords: 4, outputRows: 1, failedRecords: 3, failedRows: 3 });
  });
});

describe("오류 위치 정보", () => {
  it("오류에 레코드 인덱스·컬럼·경로·코드를 담고 원본 값은 담지 않는다", () => {
    const config = makeConfig({}, [column("points", { source: path("info", "point") })]);
    const result = run([{ id: "1", name: "n", info: { point: "비밀값123" } }], config);
    expect(result.errors).toHaveLength(1);
    const [error] = result.errors;
    expect(error).toMatchObject({ recordIndex: 0, columnId: "points", path: "info.point", code: "INTEGER_INVALID" });
    expect(JSON.stringify(error)).not.toContain("비밀값123");
  });
});

describe("샘플 이후 나타나는 변형", () => {
  it("뒤쪽 레코드의 새 타입은 그 레코드만 오류로 처리하고 나머지는 계속한다", () => {
    const config = makeConfig({}, [column("points", { source: path("p") })]);
    const records = Array.from({ length: 50 }, (_, i) => ({ id: String(i), name: "n", p: i }));
    records.push({ id: "50", name: "n", p: { nested: 1 } as unknown as number });
    records.push({ id: "51", name: "n", p: 51 });
    const result = run(records, config);
    expect(result.stats).toEqual({ sourceRecords: 52, outputRows: 51, failedRecords: 1, failedRows: 1 });
    expect(result.errors).toMatchObject([{ recordIndex: 50, code: "STRUCTURED_VALUE" }]);
  });

  it("레코드 경로가 없으면 변환을 시작하지 않는다", () => {
    const result = run({ other: [] }, makeConfig({ records: { mode: "array", path: ["items"] } }));
    expect(result.status).toBe("failed");
    expect(result.errors).toMatchObject([{ recordIndex: -1, code: "RECORDS_PATH_NOT_FOUND" }]);
    expect(result.csv).toBeNull();
  });

  it("파일 끝이 깨진 JSON은 성공으로 표시하지 않는다", () => {
    const result = run('[{"id":"1","name":"n"},{"id":"2"', makeConfig());
    expect(result.status).toBe("failed");
    expect(result.errors[0].code).toBe("JSON_INVALID");
  });
});

describe("소스 종류", () => {
  it("우선순위 필드: 상위 경로가 손상되면 하위로 넘어가지 않고 오류", () => {
    const config = makeConfig({}, [
      column("phone", {
        source: { kind: "firstOf", sources: [path("j", "x"), path("tel")] },
      }),
    ]);
    const result = run(
      [
        { id: "1", name: "n", tel: "010" },
        { id: "2", name: "n", j: "문자열", tel: "011" },
      ],
      config,
    );
    expect(result.rows[0].cells).toContain("010");
    expect(result.errors).toMatchObject([{ recordIndex: 1, code: "PATH_TYPE_MISMATCH" }]);
  });

  it("문자열 결합과 배열 셀 결합", () => {
    const config = makeConfig({}, [
      column("memo", {
        source: {
          kind: "concat",
          parts: [path("a"), { kind: "literal", value: "님" }, path("missing")],
          separator: " ",
          skipEmpty: true,
        },
      }),
      column("productCode", {
        source: { kind: "join", scope: "record", arrayPath: ["items"], valuePath: ["code"], separator: "|", skipMissing: true },
      }),
    ]);
    const result = run([{ id: "1", name: "n", a: "홍", items: [{ code: "A" }, {}, { code: 7 }] }], config);
    expect(cellsOf(result, "memo")).toEqual(["홍 님"]);
    expect(cellsOf(result, "productCode")).toEqual(["A|7"]);
  });

  it("조건 선택: 일치 0건 정책", () => {
    const config = makeConfig({}, [
      column("phone", {
        source: {
          kind: "pick",
          scope: "record",
          arrayPath: ["c"],
          select: { by: "match", field: ["t"], equals: "m" },
          valuePath: ["v"],
          onNone: "error",
          onMany: "first",
        },
      }),
    ]);
    const result = run(
      [
        { id: "1", name: "n", c: [{ t: "m", v: "1" }, { t: "m", v: "2" }] },
        { id: "2", name: "n", c: [] },
      ],
      config,
    );
    expect(cellsOf(result, "phone")[0]).toBe("1");
    expect(result.errors).toMatchObject([{ recordIndex: 1, code: "MATCH_NONE" }]);
  });

  it("구조값을 셀에 암묵적으로 문자열화하지 않는다", () => {
    const config = makeConfig({}, [column("memo", { source: path("obj") })]);
    const result = run([{ id: "1", name: "n", obj: { a: 1 } }], config);
    expect(result.errors).toMatchObject([{ code: "STRUCTURED_VALUE" }]);
  });
});

describe("행 펼치기", () => {
  const base = (onEmpty: "skipRecord" | "blankRow" | "error") =>
    makeConfig({ explode: { path: ["items"], onEmpty } }, [
      column("productCode", { source: { kind: "path", scope: "item", path: ["sku"] } }),
    ]);
  const input = [
    { id: "1", name: "n", items: [{ sku: "a" }, { sku: "b" }] },
    { id: "2", name: "n", items: [] },
    { id: "3", name: "n" },
  ];

  it("레코드 값을 항목 수만큼 복사하고 데카르트 곱을 만들지 않는다", () => {
    const result = run(input, base("skipRecord"));
    expect(result.rows.map((r) => [r.recordIndex, r.itemIndex])).toEqual([
      [0, 0],
      [0, 1],
    ]);
    expect(cellsOf(result, "customerNo")).toEqual(["1", "1"]);
    expect(cellsOf(result, "productCode")).toEqual(["a", "b"]);
  });

  it("빈 배열·누락 정책: blankRow / error", () => {
    expect(run(input, base("blankRow")).rows.map((r) => r.recordIndex)).toEqual([0, 0, 1, 2]);
    const result = run(input, base("error"));
    expect(result.errors.map((e) => [e.recordIndex, e.code])).toEqual([
      [1, "EXPLODE_EMPTY"],
      [2, "EXPLODE_EMPTY"],
    ]);
    expect(result.stats).toEqual({ sourceRecords: 3, outputRows: 2, failedRecords: 2, failedRows: 0 });
  });

  it("펼치기 대상이 배열이 아니면 레코드 오류", () => {
    const result = run([{ id: "1", name: "n", items: "x" }], base("skipRecord"));
    expect(result.errors).toMatchObject([{ recordIndex: 0, code: "EXPLODE_NOT_ARRAY" }]);
  });
});

describe("실행 중 규칙 고정", () => {
  it("컴파일 이후 설정 객체를 바꿔도 이미 시작한 작업의 규칙은 바뀌지 않는다", () => {
    const config = makeConfig({}, [column("memo", { source: path("m") })]);
    const compiled = compile(config);
    const memo = config.columns.find((c) => c.columnId === "memo")!;
    memo.source = { kind: "constant", value: "바뀐 값" };
    config.csv.delimiter = ";";
    const result = convertDocument(JSON.stringify([{ id: "1", name: "n", m: "원래" }]), compiled);
    expect(result.csv).toContain("1,n,,,,,,원래,");
  });
});
