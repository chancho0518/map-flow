import type { Metadata } from "next";
import { MappingList } from "@/components/MappingList/MappingList";

export const metadata: Metadata = { title: "매핑 설정 — Map Flow" };

export default function MappingsPage() {
  return <MappingList />;
}
