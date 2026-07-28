import { describe, expect, it } from "vitest";
import {
  isProductSlug,
  normalizeProductParam,
  productQuery,
  resolveProductParam,
} from "@/lib/product-slug";

// The product a user just ingested under has to survive the hop to `/promos/new`
// and `/library`. It used to be dropped: the onward links carried no product and
// the create form always re-seeded the server default, so the promo rendered
// without the assets the user had just uploaded.
describe("product slug shape", () => {
  it("accepts the slugs the create form accepts", () => {
    expect(isProductSlug("acme-analytics")).toBe(true);
    expect(isProductSlug("demo-product")).toBe(true);
    expect(isProductSlug("v1.2_beta")).toBe(true);
  });

  it("rejects traversal, separators and out-of-bounds lengths", () => {
    expect(isProductSlug("../../etc/passwd")).toBe(false);
    expect(isProductSlug("acme/analytics")).toBe(false);
    expect(isProductSlug("acme analytics")).toBe(false);
    expect(isProductSlug("a")).toBe(false);
    expect(isProductSlug("x".repeat(65))).toBe(false);
    expect(isProductSlug("")).toBe(false);
    expect(isProductSlug(undefined)).toBe(false);
  });
});

describe("normalizeProductParam", () => {
  it("returns the trimmed slug", () => {
    expect(normalizeProductParam(" acme-analytics ")).toBe("acme-analytics");
  });

  it("takes the first usable value of a repeated param", () => {
    expect(normalizeProductParam(["../bad", "acme-analytics"])).toBe("acme-analytics");
  });

  it("returns undefined when there is nothing usable", () => {
    expect(normalizeProductParam(undefined)).toBeUndefined();
    expect(normalizeProductParam("")).toBeUndefined();
    expect(normalizeProductParam("../../etc")).toBeUndefined();
  });
});

describe("resolveProductParam", () => {
  it("honours a well-formed param over the server default", () => {
    expect(resolveProductParam("acme-analytics", "demo-product")).toBe("acme-analytics");
  });

  it("falls back to the server default when the param is absent or malformed", () => {
    expect(resolveProductParam(undefined, "demo-product")).toBe("demo-product");
    expect(resolveProductParam("../../etc", "demo-product")).toBe("demo-product");
  });
});

describe("productQuery", () => {
  it("builds the search param an onward link carries", () => {
    expect(productQuery("acme-analytics")).toBe("?product=acme-analytics");
  });

  it("is empty when there is no product to carry, so the target uses its default", () => {
    expect(productQuery(undefined)).toBe("");
    expect(productQuery("")).toBe("");
    expect(productQuery("a")).toBe("");
  });
});
