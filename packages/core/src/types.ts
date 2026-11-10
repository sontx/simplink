/**
 * A synchronous value or an asynchronous result, used by extension hooks.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Supported knowledge-base document types.
 */
export const NODE_TYPES = [
  "goal",
  "procedure",
  "capability",
  "state",
  "constraint",
  "simp",
] as const;

/**
 * A supported knowledge-base document type.
 */
export type NodeType = (typeof NODE_TYPES)[number];

/**
 * Maps top-level document folder names to their node types.
 */
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

/**
 * A frontmatter relationship kind, including derived choice-option edges.
 */
export type EdgeKind = (typeof EDGE_KINDS)[number];

/**
 * Plan and permission requirements declared by a document.
 */
export interface Availability {
  /** Allowed plan identifiers; an empty or omitted list imposes no plan restriction. */
  plans?: string[];
  /** Required permission identifiers. */
  permissions?: string[];
}

/**
 * A normalized knowledge-base document with its original frontmatter and Markdown body.
 */
export interface KBNode {
  /** Stable node or definition identifier. */
  id: string;
  /** Document node type. */
  type: NodeType;
  /** Path relative to the KB root, POSIX separators. */
  path: string;
  /** Human-readable title. */
  title: string;
  /** Short description of the node. */
  summary: string;
  /** Alternative phrases used to discover the node. */
  aliases: string[];
  /** Searchable classification tags. */
  tags: string[];
  /** Active or deprecated document status. */
  status: "active" | "deprecated";
  /** Declared plan and permission requirements. */
  availability?: Availability;
  /** Raw frontmatter, for type-specific fields (when_to_use, check, severity, ...). */
  data: Record<string, unknown>;
  /** Markdown body without YAML frontmatter. */
  body: string;
}

/**
 * A directed relationship between node identifiers; its target may be missing.
 */
export interface KBEdge {
  /** Source node identifier. */
  from: string;
  /** Target node identifier; the node may be absent. */
  to: string;
  /** Discriminator identifying the relationship or plan step. */
  kind: EdgeKind;
  /** "body" = derived from a [[wikilink]]. */
  source: "frontmatter" | "body";
}

/**
 * A graph snapshot with node lookup and incoming/outgoing adjacency indexes. Rebuild after mutation.
 */
export interface KBGraph {
  /** Nodes keyed by their identifiers. */
  nodes: Map<string, KBNode>;
  /** Directed graph relationships. */
  edges: KBEdge[];
  /** Outgoing edges per node (includes dangling targets). */
  out: Map<string, KBEdge[]>;
  /** Incoming edges per node (only resolved targets). */
  in: Map<string, KBEdge[]>;
}

/**
 * Severity of a validation or lint diagnostic.
 */
export type Severity = "error" | "warning";

/**
 * A validation or lint diagnostic associated with a document path.
 */
export interface Issue {
  /** Stable diagnostic code. */
  code: string;
  /** Severity of the diagnostic or constraint. */
  severity: Severity;
  /** Document path relative to the knowledge-base root. */
  path: string;
  /** Human-readable diagnostic explanation. */
  message: string;
  /** 1-based line in the source file, when the diagnostic points at one. */
  line?: number;
}

/**
 * Creates a diagnostic; codes starting with E are errors and all other codes are warnings.
 * @param code - Diagnostic identifier.
 * @param path - Document path relative to the KB root.
 * @param message - Human-readable explanation.
 * @param line - Optional 1-based source line; omitted from the result when undefined.
 * @returns The diagnostic with its inferred severity.
 */
export const issue = (
  code: string,
  path: string,
  message: string,
  line?: number,
): Issue => ({
  code,
  severity: code.startsWith("E") ? "error" : "warning",
  path,
  message,
  ...(line !== undefined ? { line } : {}),
});

/**
 * A named procedure branch in a document choice definition.
 */
export interface ChoiceOptionDef {
  /** Stable option key used to select this branch. */
  key: string;
  /** Human-readable condition for choosing this option. */
  when: string;
  /** Procedure referenced or executed by this entry. */
  procedure: string;
}

/**
 * A procedure decision and the branches available to answer it.
 */
export interface ChoiceDef {
  /** Stable node or definition identifier. */
  id: string;
  /** Question presented when selecting a branch. */
  question: string;
  /** Available branch options. */
  options: ChoiceOptionDef[];
}

/**
 * A local Markdown image in a procedure's `## Steps` or a state's body, attached to plan steps.
 */
export interface NodeImage {
  /** Image path relative to the KB root, such as assets/billing/card-form.png; written relative to the node file. */
  src: string;
  /** Alt text: what the image shows; plans for agents carry this instead of the image. */
  alt: string;
  /** Procedures only: the 1-based `## Steps` item the image is written in. */
  step?: number;
}
