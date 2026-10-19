export * from "./types.js";
export { loadDocs, deriveId } from "./loader.js";
export { createValidator, SCHEMA_DIR } from "./schema.js";
export { buildGraph, extractWikilinks } from "./graph.js";
export { lintGraph } from "./lint-graph.js";
export { lintKB, type LintResult } from "./lint.js";

export * from "./resolve.js";
export { renderResolvedGoal, type RenderOptions, type RenderResult } from "./render.js";
export { section, orderedItems, estimateTokens } from "./markdown.js";
export * from "./search.js";
export { createKBTools, buildDefinitions, TOOL_DEFINITIONS, type KBToolsOptions, type ToolDefinition, type ToolResult, type KBTools, type KBStatus } from "./tools/core.js";
