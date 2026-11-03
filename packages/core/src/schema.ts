import * as ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv/dist/2020.js";
import { NODE_TYPES, type NodeType } from "./types.js";

// ajv ships CJS; under NodeNext the class may sit on .default.
const Ajv2020 = ajv2020.default.default ?? ajv2020.default;

/**
 * A frontmatter validation finding without a document path.
 */
export interface SchemaFinding {
  /** Stable diagnostic code. */
  code: string;
  /** Human-readable diagnostic explanation. */
  message: string;
  /** Frontmatter path the finding points at, e.g. `["procedures", 1]`; used to report a source line. */
  field?: (string | number)[];
}

/**
 * Replacement frontmatter validator; return findings or an empty array, synchronously or asynchronously.
 */
export type ValidatorExtension = (
  type: NodeType,
  data: unknown,
) => import("./types.js").MaybePromise<SchemaFinding[]>;

/**
 * Synchronous frontmatter validator returning findings, or an empty array for valid data.
 */
export type FrontmatterValidator = (
  type: NodeType,
  data: unknown,
) => SchemaFinding[];

/**
 * Compiles supplied JSON schemas for all node types.
 * @param schemas - JSON schemas including shared definitions.
 * @returns A reusable synchronous frontmatter validator.
 * @throws If schemas cannot be compiled, or a required node schema is missing.
 */
export function compileValidator(
  schemas: readonly object[],
): FrontmatterValidator {
  const ajv = new Ajv2020({ allErrors: true, verbose: true, strict: true });
  for (const schema of schemas) ajv.addSchema(schema);
  const byType = new Map<NodeType, ValidateFunction>();
  for (const t of NODE_TYPES) {
    const fn = ajv.getSchema(`https://kb.local/schemas/${t}.schema.json`);
    if (!fn) throw new Error(`Missing schema for type "${t}"`);
    byType.set(t, fn);
  }

  return (type, data) => {
    const validate = byType.get(type)!;
    if (validate(data)) return [];
    const seen = new Set<string>();
    const findings: SchemaFinding[] = [];
    for (const err of validate.errors ?? []) {
      const f = toFinding(err);
      if (!f || seen.has(f.code + f.message)) continue;
      seen.add(f.code + f.message);
      findings.push(f);
    }
    return findings;
  };
}

// JSON pointer to path segments; array indexes become numbers.
const pointerPath = (pointer: string): (string | number)[] =>
  pointer
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));

function toFinding(err: ErrorObject): SchemaFinding | null {
  // type/id are checked against folder/path by the caller (E003/E002).
  if (err.instancePath === "/type" || err.instancePath === "/id") return null;
  const field = err.instancePath.slice(1).replace(/\//g, ".") || "(root)";
  const at = pointerPath(err.instancePath);
  const located = (finding: SchemaFinding, path = at): SchemaFinding =>
    path.length ? { ...finding, field: path } : finding;
  const p = err.params as Record<string, unknown>;
  switch (err.keyword) {
    case "required":
      return located({
        code: "E006",
        message: `missing required field "${p.missingProperty}"`,
      });
    case "minItems":
      return located({
        code: "E006",
        message: `"${field}" must have at least ${p.limit} item(s)`,
      });
    case "unevaluatedProperties":
    case "additionalProperties": {
      const key = String(p.unevaluatedProperty ?? p.additionalProperty);
      return located(
        {
          code: "E005",
          message: `unknown key "${field === "(root)" ? key : `${field}.${key}`}"`,
        },
        [...at, key],
      );
    }
    case "pattern": {
      const kind =
        (err.parentSchema as { title?: string } | undefined)?.title ?? "id";
      return located({
        code: "E008",
        message: `${field}: "${String(err.data)}" is not a valid ${kind}`,
      });
    }
    default:
      return located({
        code: "E012",
        message: `${field} ${err.message ?? "is invalid"}`,
      });
  }
}
