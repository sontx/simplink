/**
 * Relationship kinds grouped by what they say about a plan, so the graph
 * filters offer three choices instead of one per kind.
 */
export const RELATIONSHIP_GROUPS = [
  {
    key: "steps",
    title: "Plan steps",
    kinds: ["procedures", "requires", "choice_option", "uses"],
  },
  {
    key: "conditions",
    title: "Conditions",
    kinds: [
      "preconditions",
      "optional_preconditions",
      "produces",
      "satisfied_by",
    ],
  },
  {
    key: "links",
    title: "Rules and links",
    kinds: ["constrained_by", "related"],
  },
] as const;

export interface RelationshipGroup {
  key: string;
  title: string;
  kinds: string[];
}

/**
 * The groups that have edges in this KB, each with only the kinds present.
 * Kinds no group names (a newer schema) collect under "Other".
 */
export function relationshipGroups(
  present: readonly string[],
): RelationshipGroup[] {
  const known = new Set<string>(RELATIONSHIP_GROUPS.flatMap((g) => g.kinds));
  const groups: RelationshipGroup[] = RELATIONSHIP_GROUPS.map((group) => ({
    key: group.key,
    title: group.title,
    kinds: group.kinds.filter((kind) => present.includes(kind)),
  }));
  const other = present.filter((kind) => !known.has(kind));
  if (other.length) groups.push({ key: "other", title: "Other", kinds: other });
  return groups.filter((group) => group.kinds.length);
}

/** A group's checkbox: on when every kind shows, mixed when only some do. */
export function groupState(
  kinds: readonly string[],
  selected: readonly string[],
): boolean | "indeterminate" {
  const on = kinds.filter((kind) => selected.includes(kind)).length;
  return on === kinds.length ? true : on ? "indeterminate" : false;
}

/** Toggling a group: a fully shown group hides; otherwise every kind in it shows. */
export function toggleGroup(
  kinds: readonly string[],
  selected: readonly string[],
): string[] {
  return groupState(kinds, selected) === true
    ? selected.filter((kind) => !kinds.includes(kind))
    : [...selected, ...kinds.filter((kind) => !selected.includes(kind))];
}
