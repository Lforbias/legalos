import { BOX_AVAILABLE, BOX_UNAVAILABLE_MESSAGE } from "@/lib/box-retirement";
import { ConflictError } from "@/lib/permissions/check";
export function assertBoxAvailable() {
  if (!BOX_AVAILABLE) throw new ConflictError(BOX_UNAVAILABLE_MESSAGE);
}
