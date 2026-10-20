export * from "./types.js";

export { loadDocs, deriveId, parseDoc, type RawDoc } from "./loader.js";

export {
  createValidator,
  SCHEMA_DIR,
  type FrontmatterValidator,
  type SchemaFinding,
  type ValidatorExtension,
} from "./schema.js";

export { buildGraph, extractWikilinks, goalsOf } from "./graph.js";

export { lintGraph } from "./lint-graph.js";

export {
  lintKB,
  type LintResult,
  type LintOptions,
  type LintRule,
} from "./lint.js";

export * from "./resolve.js";

export * from "./render.js";

export { section, orderedItems, estimateTokens } from "./markdown.js";

export * from "./search.js";

export {
  createKBTools,
  buildDefinitions,
  TOOL_DEFINITIONS,
  type KBToolsOptions,
  type ToolDefinition,
  type ToolResult,
  type KBTools,
  type KBToolSpec,
  defaultToolSpecs,
  ToolError,
} from "./tools/core.js";

export * from "./source.js";

export * from "./kb.js";

export { runLint } from "./cli/lint.js";

export { runSearch } from "./cli/search.js";

export { runResolve } from "./cli/resolve.js";

export type { CliContext } from "./cli/context.js";
