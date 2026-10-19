export const NODE_TYPES = ["goal", "procedure", "capability", "state", "constraint"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const FOLDER_TO_TYPE: Readonly<Record<string, NodeType>> = {
  goals: "goal",
  procedures: "procedure",
  capabilities: "capability",
  states: "state",
  constraints: "constraint",
};

/** Frontmatter keys that produce edges. Declared one direction only; reverse is computed. */
export const EDGE_KINDS = [
  "procedures",
  "requires",
  "preconditions",
  "optional_preconditions",
  "produces",
  "uses",
  "constrained_by",
  "satisfied_by",
  "related",
  /** Derived from procedure `choices[].options[].procedure`. */
  "choice_option",
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export interface Availability {
  plans?: string[];
  permissions?: string[];
}

export interface KBNode {
  id: string;
  type: NodeType;
  /** Path relative to the KB root, POSIX separators. */
  path: string;
  title: string;
  summary: string;
  aliases: string[];
  tags: string[];
  status: "active" | "deprecated";
  availability?: Availability;
  /** Raw frontmatter, for type-specific fields (when_to_use, check, severity, ...). */
  data: Record<string, unknown>;
  body: string;
}

export interface KBEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** "body" = derived from a [[wikilink]]. */
  source: "frontmatter" | "body";
}

export interface KBGraph {
  nodes: Map<string, KBNode>;
  edges: KBEdge[];
  /** Outgoing edges per node (includes dangling targets). */
  out: Map<string, KBEdge[]>;
  /** Incoming edges per node (only resolved targets). */
  in: Map<string, KBEdge[]>;
}

export type Severity = "error" | "warning";

export interface Issue {
  code: string;
  severity: Severity;
  path: string;
  message: string;
}

export const issue = (code: string, path: string, message: string): Issue => ({
  code,
  severity: code.startsWith("E") ? "error" : "warning",
  path,
  message,
});

export interface ChoiceOptionDef {
  key: string;
  when: string;
  procedure: string;
}

export interface ChoiceDef {
  id: string;
  question: string;
  options: ChoiceOptionDef[];
}
