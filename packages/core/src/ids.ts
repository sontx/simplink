import { EDGE_KINDS, FOLDER_TO_TYPE } from "./types.js";
export interface QualifiedId {
  simp?: string;
  id: string;
}

export function parseRef(ref: string): QualifiedId {
  const colon = ref.indexOf(":");
  return colon < 0
    ? { id: ref }
    : { simp: ref.slice(0, colon), id: ref.slice(colon + 1) };
}

export const formatRef = (ref: QualifiedId): string =>
  ref.simp ? `${ref.simp}:${ref.id}` : ref.id;

export const isQualified = (ref: string): boolean => ref.includes(":");

export const qualify = (ref: string, simp: string): string =>
  isQualified(ref) ? ref : `${simp}:${ref}`;

export const localize = (ref: string, ownName: string | undefined): string => {
  const parsed = parseRef(ref);
  return ownName && parsed.simp === ownName ? parsed.id : ref;
};

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
