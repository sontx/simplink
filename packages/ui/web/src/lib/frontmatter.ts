import { Ajv2020 } from "ajv/dist/2020.js";
import { isMap, isNode, isScalar, isSeq, parseDocument } from "yaml";
import type { NodeType } from "@sontx/simplink-core";
import defs from "@sontx/simplink-core/schemas/defs.schema.json" with { type: "json" };
import goal from "@sontx/simplink-core/schemas/goal.schema.json" with { type: "json" };
import procedure from "@sontx/simplink-core/schemas/procedure.schema.json" with { type: "json" };
import capability from "@sontx/simplink-core/schemas/capability.schema.json" with { type: "json" };
import state from "@sontx/simplink-core/schemas/state.schema.json" with { type: "json" };
import constraint from "@sontx/simplink-core/schemas/constraint.schema.json" with { type: "json" };

const schemas = { goal, procedure, capability, state, constraint };
const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addSchema(defs);
for (const schema of Object.values(schemas)) ajv.addSchema(schema);

export interface FrontmatterDiagnostic {
  start: number;
  end: number;
  message: string;
}

export interface FrontmatterCompletion {
  label: string;
  insertText: string;
  start: number;
  end: number;
  kind: "property" | "value";
  detail?: string;
}

export function getFrontmatter(raw: string) {
  const opening = /^\uFEFF?---[^\S\r\n]*(?:\r?\n|$)/.exec(raw);
  if (!opening) return null;
  const start = opening[0].length;
  const closing = /^---[^\S\r\n]*(?:\r?\n|$)/m.exec(raw.slice(start));
  const end = closing ? start + closing.index : raw.length;
  return { yaml: raw.slice(start, end), start, end, closed: !!closing };
}

export function validateFrontmatter(
  raw: string,
  type: NodeType,
): FrontmatterDiagnostic[] {
  const block = getFrontmatter(raw);
  if (!block)
    return [{ start: 0, end: 3, message: "Missing YAML frontmatter (---)." }];
  const diagnostics: FrontmatterDiagnostic[] = [];
  if (!block.closed)
    diagnostics.push({
      start: 0,
      end: 3,
      message: "Missing closing frontmatter delimiter (---).",
    });
  const doc = parseDocument(block.yaml, { prettyErrors: false });
  const range = (start = 0, end = start + 1) => ({
    start: block.start + start,
    end: block.start + Math.max(start + 1, end),
  });
  for (const error of doc.errors)
    diagnostics.push({ ...range(...error.pos), message: error.message });
  if (doc.errors.length) return diagnostics;
  let data: unknown;
  try {
    data = doc.toJS({ maxAliasCount: 100 });
  } catch (error) {
    return [...diagnostics, { ...range(), message: String(error) }];
  }
  const validate = ajv.getSchema(schemas[type].$id)!;
  validate(data);
  for (const error of validate.errors ?? []) {
    const path = error.instancePath
      .split("/")
      .slice(1)
      .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
    const extra =
      error.params.unevaluatedProperty ?? error.params.additionalProperty;
    if (extra !== undefined) path.push(String(extra));
    let node = doc.getIn(path, true);
    if (extra !== undefined) {
      const parent =
        path.length === 1 ? doc.contents : doc.getIn(path.slice(0, -1), true);
      if (isMap(parent))
        node = parent.items.find(
          (pair) => isScalar(pair.key) && String(pair.key.value) === extra,
        )?.key;
    }
    if (!isNode(node)) node = doc.contents;
    const [start, end] = isNode(node) && node.range ? node.range : [0, 1];
    const field = path.join(".");
    diagnostics.push({
      ...range(start, end),
      message:
        extra !== undefined
          ? `Unknown field "${field}".`
          : `${field ? `${field}: ` : ""}${error.message ?? "Invalid frontmatter"}`,
    });
  }
  return diagnostics;
}

interface CompletionSchema {
  $ref?: string;
  allOf?: CompletionSchema[];
  type?: string;
  properties?: Record<string, CompletionSchema>;
  items?: CompletionSchema;
  enum?: unknown[];
  const?: unknown;
  description?: string;
}

function expand(schema: CompletionSchema): CompletionSchema {
  // shortcut: completions resolve bundled $ref/allOf shapes, extend when schemas add other combinators.
  const ref = schema.$ref?.split("#")[1];
  const referenced = ref
    ?.split("/")
    .slice(1)
    .reduce<unknown>(
      (value, key) => (value as Record<string, unknown>)?.[key],
      defs,
    );
  const inherited = [
    ...(referenced ? [referenced as CompletionSchema] : []),
    ...(schema.allOf ?? []),
  ].map(expand);
  return Object.assign({}, ...inherited, schema, {
    properties: Object.assign(
      {},
      ...inherited.map((item) => item.properties),
      schema.properties,
    ),
  });
}

const placeholder = "__simplink_completion__";
type Path = (string | number)[];

interface CompletionContext {
  path: Path;
  keys?: string[];
}

function completionContext(
  node: unknown,
  path: Path = [],
): CompletionContext | undefined {
  if (isScalar(node) && node.value === placeholder) return { path };
  if (isMap(node)) {
    for (const pair of node.items) {
      if (!isScalar(pair.key)) continue;
      if (pair.key.value === placeholder)
        return {
          path,
          keys: node.items
            .filter((item) => isScalar(item.key))
            .map((item) => String((item.key as { value: unknown }).value)),
        };
      const found = completionContext(pair.value, [
        ...path,
        String(pair.key.value),
      ]);
      if (found) return found;
    }
  }
  if (isSeq(node)) {
    for (let index = 0; index < node.items.length; index++) {
      const found = completionContext(node.items[index], [...path, index]);
      if (found) return found;
    }
  }
}

export function completeFrontmatter(
  raw: string,
  offset: number,
  type: NodeType,
): FrontmatterCompletion[] {
  const block = getFrontmatter(raw);
  if (
    !block ||
    offset < block.start ||
    offset > block.end ||
    (block.closed && offset === block.end)
  )
    return [];
  const local = offset - block.start;
  const before = block.yaml.slice(0, local);
  const after = block.yaml.slice(local);
  const start = local - (before.match(/[\w-]*$/)?.[0].length ?? 0);
  const end = local + (after.match(/^[\w-]*/)?.[0].length ?? 0);
  const prefix = block.yaml.slice(before.lastIndexOf("\n") + 1, start);
  const hasColon = /^[ \t]*:/.test(block.yaml.slice(end));
  const addColon = /^[ \t]*(?:-[ \t]+)?$/.test(prefix) && !hasColon;
  const doc = parseDocument(
    block.yaml.slice(0, start) +
      placeholder +
      (addColon ? ": null" : "") +
      block.yaml.slice(end),
  );
  const context = completionContext(doc.contents);
  if (!context) return [];
  let schema: CompletionSchema = schemas[type];
  for (const key of context.path) {
    const current = expand(schema);
    const next =
      typeof key === "number" ? current.items : current.properties?.[key];
    if (!next) return [];
    schema = next;
  }
  schema = expand(schema);
  const range = { start: block.start + start, end: block.start + end };
  if (Object.keys(schema.properties ?? {}).length) {
    return Object.entries(schema.properties!)
      .filter(([key]) => !context.keys?.includes(key))
      .map(([key, value]) => ({
        ...range,
        label: key,
        insertText: key + (hasColon ? "" : ": "),
        kind: "property",
        detail: expand(value).description,
      }));
  }
  const values =
    schema.const !== undefined
      ? [schema.const]
      : (schema.enum ?? (schema.type === "boolean" ? [true, false] : []));
  return values.map((value) => ({
    ...range,
    label: String(value),
    insertText: String(value),
    kind: "value",
  }));
}
