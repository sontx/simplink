import { EDGE_KINDS, FOLDER_TO_TYPE } from "./types.js";
/** A node reference split into its owning simp and local node ID. */
export interface QualifiedId {
  /** Owning simp name; absent for a reference to the current KB. */
  simp?: string;
  /** Node ID within the owning simp, such as `goal.import-customers`. */
  id: string;
}

/** Splits `crm:goal.x` into `{ simp: "crm", id: "goal.x" }`; an unqualified ID has no `simp`. */
export function parseRef(ref: string): QualifiedId {
  const colon = ref.indexOf(":");
  return colon < 0
    ? { id: ref }
    : { simp: ref.slice(0, colon), id: ref.slice(colon + 1) };
}

/** Joins a {@link QualifiedId} back into `simp:id`, or the bare ID when it has no simp. */
export const formatRef = (ref: QualifiedId): string =>
  ref.simp ? `${ref.simp}:${ref.id}` : ref.id;

/** Whether a reference names another simp (`crm:goal.x`). */
export const isQualified = (ref: string): boolean => ref.includes(":");

/** Prefixes an unqualified reference with `simp`; already qualified references are returned unchanged. */
export const qualify = (ref: string, simp: string): string =>
  isQualified(ref) ? ref : `${simp}:${ref}`;

/** Strips the prefix when a reference is qualified with this simp's own name, so `own:goal.x` becomes `goal.x`. */
export const localize = (ref: string, ownName: string | undefined): string => {
  const parsed = parseRef(ref);
  return ownName && parsed.simp === ownName ? parsed.id : ref;
};

/**
 * Inverse of the loader's ID derivation: `procedure.a.b` becomes
 * `procedures/a/b.md` and `simp` becomes `simp.md`. Returns `undefined` for an
 * unknown type prefix or an invalid segment.
 */
export function idToPath(id: string): string | undefined {
  if (id === "simp") return "simp.md";
  const [type, ...segments] = id.split(".");
  const folder = Object.keys(FOLDER_TO_TYPE).find(
    (key) => FOLDER_TO_TYPE[key] === type,
  );
  if (
    !folder ||
    !segments.length ||
    !segments.every((s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s))
  )
    return undefined;
  return `${folder}/${segments.join("/")}.md`;
}

/** Copy only the graph reference fields, preserving all other metadata. */
export function rewriteRefs(
  data: Record<string, unknown>,
  map: (ref: string) => string,
): Record<string, unknown> {
  const copy = { ...data };
  for (const kind of EDGE_KINDS)
    if (Array.isArray(copy[kind]))
      copy[kind] = copy[kind].map((r: unknown) =>
        typeof r === "string" ? map(r) : r,
      );
  if (Array.isArray(data.choices))
    copy.choices = data.choices.map((c) =>
      c && typeof c === "object"
        ? {
            ...c,
            ...(Array.isArray(c.options)
              ? {
                  options: c.options.map((o: Record<string, unknown>) =>
                    o && typeof o === "object"
                      ? {
                          ...o,
                          ...(typeof o.procedure === "string"
                            ? { procedure: map(o.procedure) }
                            : {}),
                        }
                      : o,
                  ),
                }
              : {}),
          }
        : c,
    );
  return copy;
}
