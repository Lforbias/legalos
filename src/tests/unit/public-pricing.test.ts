import { describe, expect, it } from "vitest";
import { pricingIsPublic } from "@/lib/public-pricing";

describe("preços públicos", () => {
  it("ficam escondidos até PUBLIC_PRICING=1", () => {
    expect(pricingIsPublic({})).toBe(false);
    expect(pricingIsPublic({ PUBLIC_PRICING: "0" })).toBe(false);
    expect(pricingIsPublic({ PUBLIC_PRICING: "true" })).toBe(false);
    expect(pricingIsPublic({ PUBLIC_PRICING: " 1 " })).toBe(true);
  });
});
