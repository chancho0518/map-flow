import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 서버 없이 정적 파일(out/)로 배포한다. Cloudflare Pages 출력 디렉터리: out
  output: "export",
  // /mappings → /mappings/index.html 로 생성해 정적 호스팅에서 새로고침이 동작하게 한다.
  trailingSlash: true,
  images: { unoptimized: true },
  // cacheComponents/partialPrefetching(PPR)는 정적 export와 함께 쓸 수 없어 사용하지 않는다.
  // ("Invariant: PPR cannot be enabled in export mode", Next.js 16.4)
};

export default nextConfig;
