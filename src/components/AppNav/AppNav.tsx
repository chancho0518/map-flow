"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { demoSchema } from "@/schemas/load";
import styles from "./AppNav.module.css";

const MENU = [
  { href: "/mappings/", label: "매핑 설정" },
  { href: "/conversion/", label: "대량 변환" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        Map Flow
      </Link>
      <nav className={styles.nav} aria-label="주 메뉴">
        {MENU.map((item) => {
          const active = pathname?.startsWith(item.href.replace(/\/$/, ""));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? styles.active : styles.link}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {demoSchema.isDemo && (
        <span
          className={styles.badge}
          title="실제 고객 CSV 양식이 아닌 개발용 데모 스키마입니다."
        >
          데모 스키마 · {demoSchema.name} v{demoSchema.version}
        </span>
      )}
    </header>
  );
}
