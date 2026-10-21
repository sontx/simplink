import type { DocSource } from "./source.js";
import type { FrontmatterValidator } from "./schema.js";

export const SCHEMA_DIR = "";

export function fsSource(): DocSource {
  throw new Error("Pass a DocSource when loading a KB in the browser");
}

export function createValidator(): FrontmatterValidator {
  throw new Error("Pass a validator when loading a KB in the browser");
}

export function defaultValidator(): FrontmatterValidator {
  return createValidator();
}
