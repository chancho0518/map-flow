import type { Metadata } from "next";
import { AppNav } from "@/components/AppNav/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Map Flow — JSON → CSV 변환",
  description: "다양한 구조의 JSON을 고정된 CSV 양식으로 변환합니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>
        <AppNav />
        <main className="page">{children}</main>
        <footer className="footer">
          원본 파일은 이 브라우저 안에서만 처리되며 서버로 전송되지 않습니다.
        </footer>
      </body>
    </html>
  );
}
