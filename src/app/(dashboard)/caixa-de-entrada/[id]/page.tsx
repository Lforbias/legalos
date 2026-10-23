import type { Metadata } from "next";
import { NoticeReader } from "@/modules/inbox/notice-reader";
export const metadata: Metadata = { title: "Intimação" };
export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  return <NoticeReader id={(await params).id} />;
}
