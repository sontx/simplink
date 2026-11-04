import * as ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import { createKB, isKB, type KB, type KBExtensions } from "../kb.js";
import {
  createFederatedKB,
  isFederatedKB,
  type FederatedKB,
  type FederatedStatus,
} from "../federation/kb.js";
import { parseRef } from "../ids.js";
import type { LookupNode } from "../federation/protocol.js";
import type { DocSource } from "../source.js";
import type { ResolveOptions } from "../resolve.js";
import type { MaybePromise } from "../types.js";
export type { KBStatus } from "../kb.js";
import {
  EDGE_KINDS,
  NODE_TYPES,
  type EdgeKind,
  type NodeType,
} from "../types.js";

const Ajv2020 = ajv2020.default.default ?? ajv2020.default;

/** Provider-agnostic tool definition (maps 1:1 to MCP, Anthropic, and OpenAI tool formats). */
export interface ToolDefinition {
  /** Unique dispatch name. */
  name: string;
  /** User- or model-facing description of the tool. */
  description: string;
  /** JSON Schema used to validate arguments and apply defaults. */
  inputSchema: Record<string, unknown>;
  /** Optional provider hints describing tool behavior. */
  annotations?: {
    readOnlyHint?: boolean;
    openWorldHint?: boolean;
    title?: string;
  };
}

/**
 * Provider-independent tool response with text content and an optional error flag.
 */
export interface ToolResult {
  /** Markdown (resolve_*) or compact JSON (everything else). */
  content: string;
  /** True when content describes a tool failure. */
  isError?: boolean;
}

/**
 * Tool definition paired with a handler receiving schema-validated arguments and a loaded KB.
 */
export interface KBToolSpec {
  /** Public tool name, description, schema, and annotations. */
  definition: ToolDefinition;
  /** Handles validated arguments; throw ToolError for an expected user-facing failure. */
  handler(args: unknown, kb: FederatedKB): MaybePromise<ToolResult>;
}

/**
 * Tool definitions and validated asynchronous dispatch over a KB snapshot.
 */
export interface KBTools {
  /** Independent definitions for the configured tools. */
  definitions: ToolDefinition[];
  /** Validates a cloned argument value, applies schema defaults, and dispatches a tool. Unknown tools, invalid arguments, and handler failures return error results. */
  call(name: string, args: unknown): Promise<ToolResult>;
  /** Status of the underlying KB snapshot. */
  status: FederatedStatus;
}

// ---------- schemas ----------

const resolveProps = {
  states: {
    type: "object",
    description:
      'Known state values, e.g. {"state.channel.zalo-connected": true}. Omitted states are unknown and produce CHECK steps.',
    additionalProperties: { type: "boolean" },
  },
  plan: {
    type: "string",
    description:
      'Tenant plan (e.g. "pro"), used for availability. Omit if unknown.',
  },
  permissions: {
    type: "array",
    items: { type: "string" },
    description: "Tenant/user permissions, used for availability.",
  },
  choices: {
    type: "object",
    description:
      'Pre-selected options for CHOOSE steps: {"<choiceId>": "<optionKey>"} or {"<procedureId>:<choiceId>": "<optionKey>"} or {"<simp>:<choiceId>": "<optionKey>"} for another product.',
    additionalProperties: { type: "string" },
  },
  token_budget: {
    type: "integer",
    minimum: 200,
    maximum: 8000,
    default: 2000,
    description: "Approximate size limit for the returned plan.",
  },
  language: {
    type: "string",
    pattern: "^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$",
    description:
      'Language for the generated plan wording, e.g. "vi". Defaults to the language declared by the KB, then English. Node content is returned as written.',
  },
} as const;

const idProp = (what: string) => ({
  type: "string",
  minLength: 1,
  description: `${what} id, e.g. from search_kb results.`,
});
const readOnly = { readOnlyHint: true, openWorldHint: false };

const DEFAULT_DEFINITIONS: ToolDefinition[] = [
  {
    name: "search_kb",
    description:
      "Search the product knowledge base (diacritics optional). " +
      "Start here for any user request about what the product can do or how to achieve something. " +
      "Returns `goals` (ranked entry points; pass the best one to resolve_goal) and `hits` (matching nodes of any type). " +
      "A hit with type `procedure` and no goals is a standalone procedure; use resolve_procedure for it.",
    inputSchema: {
      type: "object",
      required: ["query"],
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description: "The user's intent in their own words.",
        },
        types: {
          type: "array",
          items: { enum: [...NODE_TYPES] },
          uniqueItems: true,
          description: "Restrict hits to these node types.",
        },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 8 },
      },
    },
    annotations: { ...readOnly, title: "Search KB" },
  },
  {
    name: "resolve_goal",
    description:
      "Turn a goal id into an ordered, actionable plan: CHECK steps for unknown states, conditional fix steps, " +
      "CHOOSE steps for branches (with each option's sub-plan), constraints, and ranked alternatives. " +
      "Pass what you already know (states, tenant plan/permissions, chosen options) to get a shorter plan. Returns Markdown.",
    inputSchema: {
      type: "object",
      required: ["goal_id"],
      additionalProperties: false,
      properties: { goal_id: idProp("Goal"), ...resolveProps },
    },
    annotations: { ...readOnly, title: "Resolve goal" },
  },
  {
    name: "resolve_procedure",
    description:
      "Same as resolve_goal for a single procedure id. Use for standalone procedures found by search_kb " +
      "(e.g. setup or fix procedures with no goal). Returns Markdown.",
    inputSchema: {
      type: "object",
      required: ["procedure_id"],
      additionalProperties: false,
      properties: { procedure_id: idProp("Procedure"), ...resolveProps },
    },
    annotations: { ...readOnly, title: "Resolve procedure" },
  },
  {
    name: "get_node",
    description:
      "Read one KB node: metadata, type-specific fields (when_to_use, check, severity, choices), outgoing and incoming edges by kind, and the Markdown body. " +
      "Use for details a plan omitted, such as a constraint's full rules.",
    inputSchema: {
      type: "object",
      required: ["id"],
      additionalProperties: false,
      properties: {
        id: idProp("Node"),
        max_body_chars: {
          type: "integer",
          minimum: 0,
          maximum: 20000,
          default: 3000,
          description: "0 omits the body.",
        },
      },
    },
    annotations: { ...readOnly, title: "Get node" },
  },
  {
    name: "get_related",
    description:
      "Explore the neighborhood of a node (breadth-first). Use to answer questions like " +
      '"what depends on X?" (direction "in") or "what does X need?" (direction "out"). Edges are returned as [from, kind, to].',
    inputSchema: {
      type: "object",
      required: ["id"],
      additionalProperties: false,
      properties: {
        id: idProp("Node"),
        depth: { type: "integer", minimum: 1, maximum: 3, default: 2 },
        direction: { enum: ["out", "in", "both"], default: "both" },
        kinds: {
          type: "array",
          items: { enum: [...EDGE_KINDS] },
          uniqueItems: true,
          description: "Only follow these edge kinds.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 40,
          description: "Max nodes returned.",
        },
      },
    },
    annotations: { ...readOnly, title: "Get related" },
  },
];

/**
 * KB extensions, tool customization, and tenant argument visibility.
 */
export interface KBToolsOptions {
  /** Extensions used when loading a new snapshot; forbidden when input is an existing KB. */
  extensions?: KBExtensions;
  /** Transforms the default specs before validation; may add, remove, or replace tools. */
  tools?: (defaults: KBToolSpec[], kb: FederatedKB) => KBToolSpec[];
  /**
   * Expose `plan` / `permissions` on resolve_* tools (default true).
   * When false they are removed from the schemas (and rejected if sent); configured tenant defaults still apply.
   */
  tenantContext?: boolean;
}

/** Tool definitions for the given options (copies; TOOL_DEFINITIONS is never mutated). */
export function buildDefinitions(opts: KBToolsOptions = {}): ToolDefinition[] {
  const defs: ToolDefinition[] = structuredClone(DEFAULT_DEFINITIONS);
  if (opts.tenantContext === false) {
    for (const d of defs.filter((d) => d.name.startsWith("resolve_"))) {
      const props = d.inputSchema.properties as Record<string, unknown>;
      delete props.plan;
      delete props.permissions;
      d.description = d.description.replace(
        "(states, tenant plan/permissions, chosen options)",
        "(states, chosen options)",
      );
    }
  }
  return defs;
}

// ---------- helpers ----------

const json = (v: unknown): ToolResult => ({
  content: JSON.stringify(v, (_, x) =>
    Array.isArray(x) && x.length === 0 ? undefined : x,
  ),
});
const fail = (msg: string): ToolResult => ({ content: msg, isError: true });
const r2 = (n: number) => Math.round(n * 100) / 100;

const COMMON_KEYS = new Set([
  "id",
  "type",
  "title",
  "summary",
  "aliases",
  "tags",
  "status",
  "availability",
  ...EDGE_KINDS,
]);

function groupEdges(
  edges: { kind: EdgeKind; id: string }[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of edges)
    (out[e.kind] ??= []).includes(e.id) || out[e.kind].push(e.id);
  return out;
}

/**
 * Expected tool-handler failure whose message is returned directly as an error result.
 */
export class ToolError extends Error {}

// ---------- factory ----------

/** Default specs are independent copies and can be replaced or removed before validation. */
export function defaultToolSpecs(opts: KBToolsOptions = {}): KBToolSpec[] {
  const handlers: Record<
    string,
    (a: any, kb: FederatedKB) => MaybePromise<ToolResult>
  > = {
    search_kb: async (a, kb) => {
      const r = await kb.search(a.query, {
        types: a.types as NodeType[] | undefined,
        limit: a.limit,
      });
      return json({
        goals: r.goals.map((g) => ({
          id: g.id,
          title: g.title,
          relevance: r2(g.relevance),
        })),
        hits: r.hits.map((h) => ({
          id: h.id,
          simp: parseRef(h.id).simp,
          type: h.type,
          title: h.title,
          summary: h.summary,
          relevance: r2(h.relevance),
          goals: h.goals,
        })),
      });
    },
    resolve_goal: async (a, kb) => {
      await requireNode(kb, a.goal_id, "goal");
      return {
        content: (
          await kb.render(await kb.resolveGoal(a.goal_id, resolveOpts(a)), {
            tokenBudget: a.token_budget,
            locale: a.language,
          })
        ).text,
      };
    },
    resolve_procedure: async (a, kb) => {
      await requireNode(kb, a.procedure_id, "procedure");
      return {
        content: (
          await kb.render(
            await kb.resolveProcedure(a.procedure_id, resolveOpts(a)),
            {
              tokenBudget: a.token_budget,
              locale: a.language,
            },
          )
        ).text,
      };
    },
    get_node: async (a, kb) => {
      const n = await requireNode(kb, a.id);
      const fields = Object.fromEntries(
        Object.entries(n.fields).filter(([k]) => !COMMON_KEYS.has(k)),
      );
      const body = (n.body ?? "").trim();
      const max: number = a.max_body_chars;
      return json({
        id: n.id,
        type: n.type,
        title: n.title,
        summary: n.summary,
        status: n.status === "deprecated" ? "deprecated" : undefined,
        aliases: n.aliases,
        tags: n.tags,
        availability: n.availability,
        fields: Object.keys(fields).length ? fields : undefined,
        out: groupEdges(n.out.map((e) => ({ kind: e.kind, id: e.to }))),
        in: groupEdges(n.in.map((e) => ({ kind: e.kind, id: e.from }))),
        body: max > 0 && body ? body.slice(0, max) : undefined,
        body_truncated: max > 0 && body.length > max ? true : undefined,
      });
    },
    get_related: async (a, kb) => {
      const id: string = a.id;
      const root = await requireNode(kb, id);
      const kinds = a.kinds ? new Set<EdgeKind>(a.kinds) : null;
      const dist = new Map([[id, 0]]);
      const known = new Map<string, LookupNode>([[id, root]]);
      const edges = new Map<string, [string, EdgeKind, string]>();
      let frontier = [id];
      let truncated = false;
      for (let d = 1; d <= a.depth && frontier.length; d++) {
        const candidates: [string, [string, EdgeKind, string]][] = [];
        for (const cur of frontier) {
          const n = known.get(cur);
          if (!n) continue;
          for (const edge of [
            ...(a.direction !== "in"
              ? n.out.map(
                  (e) => [cur, e.kind, e.to] as [string, EdgeKind, string],
                )
              : []),
            ...(a.direction !== "out"
              ? n.in.map(
                  (e) => [e.from, e.kind, cur] as [string, EdgeKind, string],
                )
              : []),
          ]) {
            if (kinds && !kinds.has(edge[1])) continue;
            candidates.push([edge[0] === cur ? edge[2] : edge[0], edge]);
          }
        }
        // Fetch unknown neighbours only for free slots, before admitting them,
        // so dangling refs never take a slot.
        const tried = new Set<string>();
        const next: string[] = [];
        for (let i = 0; i < candidates.length;) {
          const batch: string[] = [];
          let j = i;
          for (; j < candidates.length; j++) {
            const other = candidates[j][0];
            if (known.has(other) || tried.has(other)) continue;
            if (dist.size + batch.length < a.limit) batch.push(other);
            else if (batch.length) break;
            // ponytail: unfetched neighbour past the limit counts as truncation even if dangling.
            else truncated = true;
            tried.add(other);
          }
          for (const [key, n] of await kb.nodes(batch)) known.set(key, n);
          for (; i < j; i++) {
            const [other, edge] = candidates[i];
            if (!known.has(other)) continue;
            if (!dist.has(other)) {
              if (dist.size >= a.limit) {
                truncated = true;
                continue;
              }
              dist.set(other, d);
              next.push(other);
            }
            edges.set(edge.join("|"), edge);
          }
        }
        frontier = next;
      }
      return json({
        root: id,
        nodes: [...dist].flatMap(([nid, distance]) => {
          const n = known.get(nid);
          return n ? [{ id: nid, type: n.type, title: n.title, distance }] : [];
        }),
        edges: [...edges.values()].filter(
          ([f, , t]) => known.has(f) && known.has(t),
        ),
        truncated: truncated || undefined,
      });
    },
  };

  return buildDefinitions(opts).map((definition) => ({
    definition,
    handler: handlers[definition.name],
  }));
}

/**
 * Default built-in tool definitions. Use buildDefinitions to obtain independent configurable copies.
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = defaultToolSpecs().map(
  (spec) => spec.definition,
);

/**
 * Loads once or reuses an existing snapshot, then serves validated asynchronous calls.
 * @param input - Filesystem root, custom source, or existing branded KB.
 * @param opts - Extensions, tool customization, and tenant argument visibility.
 * @returns Tool definitions, dispatch, and snapshot status. Handler failures become error results.
 * @throws If extensions accompany an existing KB, names are duplicated, schemas are invalid, or initialization fails.
 */
export async function createKBTools(
  input: string | DocSource | KB | FederatedKB,
  opts: KBToolsOptions = {},
): Promise<KBTools> {
  if ((isKB(input) || isFederatedKB(input)) && opts.extensions !== undefined)
    throw new Error("extensions cannot be supplied with an existing KB");
  const kb = isFederatedKB(input)
    ? input
    : await createFederatedKB({
        local: isKB(input) ? input : await createKB(input, opts.extensions),
      });
  const { status } = kb;
  const specs = opts.tools
    ? opts.tools(defaultToolSpecs(opts), kb)
    : defaultToolSpecs(opts);
  const handlers = new Map<string, KBToolSpec["handler"]>();
  for (const spec of specs) {
    if (handlers.has(spec.definition.name))
      throw new Error(`Duplicate tool name "${spec.definition.name}"`);
    handlers.set(spec.definition.name, spec.handler);
  }
  const definitions = specs.map((spec) => structuredClone(spec.definition));
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    useDefaults: true,
  });
  const validators = new Map<string, ValidateFunction>(
    definitions.map((d) => [d.name, ajv.compile(d.inputSchema)]),
  );
  const call = async (name: string, args: unknown): Promise<ToolResult> => {
    const handler = handlers.get(name);
    const validate = validators.get(name);
    if (!handler || !validate)
      return fail(
        `Unknown tool "${name}". Available: ${definitions.map((d) => d.name).join(", ")}`,
      );
    const input = structuredClone(args ?? {});
    if (!validate(input)) {
      const msg = (validate.errors ?? [])
        .map((e) => `${e.instancePath || "(args)"} ${e.message}`)
        .join("; ");
      return fail(`Invalid arguments for ${name}: ${msg}`);
    }
    try {
      const result = await handler(input, kb);
      if (status.errors && !result.isError)
        result.content = `[KB has ${status.errors} lint error(s); results may be incomplete]\n${result.content}`;
      return result;
    } catch (err) {
      if (err instanceof ToolError) return fail(err.message);
      return fail(`Internal error in ${name}: ${(err as Error).message}`);
    }
  };

  return { definitions, call, status };
}

function resolveOpts(a: any): ResolveOptions {
  return {
    states: a.states,
    choices: a.choices,
    tenant:
      a.plan !== undefined || a.permissions !== undefined
        ? {
            ...(a.plan !== undefined ? { plan: a.plan } : {}),
            ...(a.permissions !== undefined
              ? { permissions: a.permissions }
              : {}),
          }
        : undefined,
  };
}

/** Returns the id if it exists (and has the expected type), else throws a ToolError with suggestions. */
async function requireNode(
  kb: FederatedKB,
  id: string,
  type?: NodeType,
): Promise<LookupNode> {
  const n = await kb.node(id);
  if (n && (!type || n.type === type)) return n;
  if (n && type) {
    const hint =
      n.type === "procedure"
        ? " Use resolve_procedure."
        : n.type === "goal"
          ? " Use resolve_goal."
          : "";
    throw new ToolError(`"${id}" is a ${n.type}, not a ${type}.${hint}`);
  }
  const query =
    parseRef(id).id.split(".").slice(1).join(" ").replace(/-/g, " ") || id;
  const similar = (
    await kb.search(query, { types: type ? [type] : undefined, limit: 3 })
  ).hits.map((h) => h.id);
  throw new ToolError(
    `Node "${id}" not found.${similar.length ? ` Did you mean: ${similar.join(", ")}?` : " Use search_kb to find ids."}`,
  );
}
