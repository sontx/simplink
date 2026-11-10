/**
 * Frontmatter fields never served to agents or peers. Inline `sources` is
 * deprecated authoring evidence that can name private repo paths.
 */
const PRIVATE_FIELDS: ReadonlySet<string> = new Set(["sources"]);

/** Node fields safe to serve: those not in `skip` and not private. */
export function servedFields(
  data: Record<string, unknown>,
  skip: ReadonlySet<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([k]) => !skip.has(k) && !PRIVATE_FIELDS.has(k),
    ),
  );
}
