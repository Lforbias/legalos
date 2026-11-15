import type { Metadata } from "next";
import { TasksWorkspace, type TaskSearchParams } from "@/modules/tasks/tasks-workspace";
export const metadata: Metadata = { title: "Tarefas" };
export default function TasksPage({ searchParams }: { searchParams: Promise<TaskSearchParams> }) {
  return <TasksWorkspace searchParams={searchParams} />;
}
