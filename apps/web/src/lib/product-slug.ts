// The product slug, and how it travels between screens, in one place.
//
// Four surfaces share it: the create form's zod schema, the two links that hand a
// product onward (`/ingest`'s intro copy and a finished capture's actions), and
// the two screens that read `?product=` (`/promos/new`, `/library`). Keeping the
// rule here means any slug a link can carry is exactly a slug the create form
// accepts — the alternative was `/ingest` linking to a create form that silently
// reset the product to the server default and rendered a promo without the assets
// the user had just uploaded.
//
// Validation is on SHAPE, not on "is this an existing product": the create form's
// product field is deliberately free text (AGENTS.md §4) because authoring a promo
// for a brand-new prefix is a normal first move. Rejecting a well-formed slug just
// because nothing has been ingested under it yet would re-create the same silent
// reset for anyone who opens the link before their first capture.

/** Letters, numbers, dot, dash and underscore — mirrors `types/keys.slugify`. */
export const PRODUCT_SLUG_PATTERN = /^[a-zA-Z0-9._-]+$/;

/** Matches the create form's zod bounds and `slugify`'s 64-char truncation. */
export const PRODUCT_SLUG_MIN = 2;
export const PRODUCT_SLUG_MAX = 64;

/** A well-formed product slug — safe to put in a key prefix or a URL. */
export function isProductSlug(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const slug = value.trim();
  return (
    slug.length >= PRODUCT_SLUG_MIN &&
    slug.length <= PRODUCT_SLUG_MAX &&
    PRODUCT_SLUG_PATTERN.test(slug)
  );
}

/**
 * A `?product=` search param as a usable slug, or `undefined`.
 *
 * Next hands repeated params through as an array; the first well-formed value
 * wins. Anything malformed (`../../etc`, an empty string, a 200-char blob) is
 * dropped so the caller can fall back to its own default.
 */
export function normalizeProductParam(
  param: string | string[] | undefined | null,
): string | undefined {
  const candidates = Array.isArray(param) ? param : [param];
  for (const candidate of candidates) {
    if (isProductSlug(candidate)) return candidate.trim();
  }
  return undefined;
}

/** The same, with the caller's fallback (usually the server's safe default). */
export function resolveProductParam(
  param: string | string[] | undefined | null,
  fallback: string,
): string {
  return normalizeProductParam(param) ?? fallback;
}

/**
 * `?product=<slug>` for a link that should carry the current product, or `""`
 * when there is nothing worth carrying (the target then uses its own default).
 */
export function productQuery(product: string | undefined | null): string {
  const slug = normalizeProductParam(product);
  return slug ? `?product=${encodeURIComponent(slug)}` : "";
}
