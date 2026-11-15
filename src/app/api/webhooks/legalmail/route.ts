import { boxRemovedResponse } from "@/server/box-removed";

export async function POST() {
  return boxRemovedResponse();
}
