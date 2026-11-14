import { expect, it, vi } from "vitest";
import { syncLegalMailHistory } from "@/server/services/legalmail-history.service";
import { makeOrgWithOwner } from "./helpers";

it("does not query or import judicial history through the retired LegalMail connector", async () => {
  const office = await makeOrgWithOwner("legalmail-history-retired");
  const fetcher = vi.fn<typeof fetch>();
  await expect(syncLegalMailHistory(office.ctx, "00000000-0000-4000-8000-000000000001", fetcher))
    .rejects.toThrow("captura judicial pelo LegalMail foi removida");
  expect(fetcher).not.toHaveBeenCalled();
});
