import { describe, expect, it } from "vitest";
import { column, makeConfig } from "@/core/test-helpers";
import { demoSchema } from "@/schemas/load";
import { isRunnable, parseMappingConfig, validateMappingConfig } from "./validate";

const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("설정 가져오기 검증", () => {
  it("정상 설정은 통과한다", () => {
    const result = parseMappingConfig(roundTrip(makeConfig()), demoSchema);
    expect(result.ok).toBe(true);
    if (result.ok) expect(isRunnable(result.issues)).toBe(true);
  });

  it("지원하지 않는 형식 버전은 거부한다", () => {
    const result = parseMappingConfig({ ...roundTrip(makeConfig()), formatVersion: 2 }, demoSchema);
    expect(result.ok).toBe(false);
  });

  it("알 수 없는 키·__proto__ 키가 든 설정은 거부한다", () => {
    const withProto = JSON.parse(
      JSON.stringify(makeConfig()).replace('"formatVersion":1', '"__proto__":{"polluted":true},"formatVersion":1'),
    );
    expect(parseMappingConfig(withProto, demoSchema).ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(parseMappingConfig({ ...roundTrip(makeConfig()), script: "alert(1)" }, demoSchema).ok).toBe(false);
  });

  it("등록되지 않은 변환 단계는 거부한다", () => {
    const config = roundTrip(makeConfig());
    config.columns[0].steps = [{ op: "eval", code: "1+1" }];
    expect(parseMappingConfig(config, demoSchema).ok).toBe(false);
  });

  it("출력 스키마 버전이 다르면 자동 적용하지 않는다", () => {
    const result = parseMappingConfig(roundTrip(makeConfig({ outputSchema: { id: "demo-customer", version: 2 } })), demoSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].where).toBe("outputSchema");
  });
});

describe("사용 가능 저장 조건", () => {
  it("필수 컬럼 미연결·빈칸은 사용 가능 저장을 막는다", () => {
    const issues = validateMappingConfig(
      makeConfig({}, [column("customerNo", { source: { kind: "unmapped" } }), column("customerName", { source: { kind: "blank" } })]),
      demoSchema,
    );
    expect(issues.map((i) => i.level)).toEqual(["notReady", "notReady"]);
    expect(isRunnable(issues)).toBe(false);
  });

  it("선택 컬럼도 미연결 상태로는 사용 가능 저장 불가(빈칸 명시 필요)", () => {
    const issues = validateMappingConfig(makeConfig({}, [column("memo", { source: { kind: "unmapped" } })]), demoSchema);
    expect(issues).toHaveLength(1);
  });

  it("컬럼 형식에 맞지 않는 기본값과 허용 값 밖 기본값", () => {
    const issues = validateMappingConfig(
      makeConfig({}, [
        column("points", { whenMissing: { action: "default", value: "abc" } }),
        column("grade", { whenEmpty: { action: "default", value: "골드" } }),
      ]),
      demoSchema,
    );
    expect(issues).toHaveLength(2);
  });

  it("경로를 고르지 않은 소스는 사용 가능 저장 불가", () => {
    const issues = validateMappingConfig(
      makeConfig({}, [
        column("memo", { source: { kind: "path", scope: "record", path: [] } }),
        column("phone", {
          source: {
            kind: "pick",
            scope: "record",
            arrayPath: ["c"],
            select: { by: "match", field: [], equals: "x" },
            valuePath: [],
            onNone: "missing",
            onMany: "error",
          },
        }),
      ]),
      demoSchema,
    );
    expect(issues.map((i) => [i.where, i.message])).toEqual([
      ["연락처", "조건 필드를 선택하세요."],
      ["메모", "입력 경로를 선택하세요."],
    ]);
  });

  it("행 펼치기 없이 항목 기준 경로를 쓰면 실행 불가", () => {
    const issues = validateMappingConfig(
      makeConfig({}, [column("productCode", { source: { kind: "path", scope: "item", path: ["sku"] } })]),
      demoSchema,
    );
    expect(issues).toMatchObject([{ level: "blocking" }]);
  });

  it("중복·미지정 컬럼", () => {
    const config = makeConfig();
    config.columns.push(column("memo"));
    config.columns.push(column("unknownColumn"));
    const issues = validateMappingConfig(config, demoSchema);
    expect(issues.filter((i) => i.level === "blocking")).toHaveLength(2);
  });
});
