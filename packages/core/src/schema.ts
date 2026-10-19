import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv/dist/2020.js";
import { NODE_TYPES, type NodeType } from "./types.js";

// ajv ships CJS; under NodeNext the class may sit on .default.
const Ajv2020 = ajv2020.default.default ?? ajv2020.default;

/** Works from both src/ (tsx) and dist/ (built). */
export const SCHEMA_DIR = fileURLToPath(new URL("../schemas/", import.meta.url));

export interface SchemaFinding {
  code: string;
  message: string;
}

export type FrontmatterValidator = (type: NodeType, data: unknown) => SchemaFinding[];

export function createValidator(schemaDir = SCHEMA_DIR): FrontmatterValidator {
  const ajv = new Ajv2020({ allErrors: true, verbose: true, strict: true });
  for (const file of readdirSync(schemaDir).filter((f) => f.endsWith(".schema.json"))) {
    ajv.addSchema(JSON.parse(readFileSync(path.join(schemaDir, file), "utf8")));
  }
  const byType = new Map<NodeType, ValidateFunction>();
  for (const t of NODE_TYPES) {
    const fn = ajv.getSchema(`https://kb.local/schemas/${t}.schema.json`);
    if (!fn) throw new Error(`Missing schema for type "${t}" in ${schemaDir}`);
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

function toFinding(err: ErrorObject): SchemaFinding | null {
  // type/id are checked against folder/path by the caller (E003/E002).
  if (err.instancePath === "/type" || err.instancePath === "/id") return null;
  const field = err.instancePath.slice(1).replace(/\//g, ".") || "(root)";
  const p = err.params as Record<string, unknown>;
  switch (err.keyword) {
    case "required":
      return { code: "E006", message: `missing required field "${p.missingProperty}"` };
    case "minItems":
      return { code: "E006", message: `"${field}" must have at least ${p.limit} item(s)` };
    case "unevaluatedProperties":
    case "additionalProperties": {
      const key = String(p.unevaluatedProperty ?? p.additionalProperty);
      return { code: "E005", message: `unknown key "${field === "(root)" ? key : `${field}.${key}`}"` };
    }
    case "pattern": {
      const kind = (err.parentSchema as { title?: string } | undefined)?.title ?? "id";
      return { code: "E008", message: `${field}: "${String(err.data)}" is not a valid ${kind}` };
    }
    default:
      return { code: "E012", message: `${field} ${err.message ?? "is invalid"}` };
  }
}
