import demoSchemaJson from "./demo-schema.json";
import { parseOutputSchema, type OutputSchema } from "./output-schema";

/**
 * 현재 앱이 사용하는 고정 출력 스키마.
 * 실제 CSV 양식이 제공되면 demo-schema.json 대신 실제 스키마 JSON을 넣고
 * isDemo를 false로 바꾼다. 잘못된 스키마는 빌드·테스트 시점에 바로 실패한다.
 */
export const demoSchema: OutputSchema = parseOutputSchema(demoSchemaJson);
