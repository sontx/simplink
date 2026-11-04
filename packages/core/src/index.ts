export * from "./types.js";

export { loadDocs, deriveId, parseDoc, type RawDoc } from "./loader.js";

export {
  compileValidator,
  type FrontmatterValidator,
  type SchemaFinding,
  type ValidatorExtension,
} from "./schema.js";

export { buildGraph, extractWikilinks, goalsOf } from "./graph.js";

export { lintGraph } from "./lint-graph.js";

export { locateSource, type SourceLocator } from "./source-lines.js";

export {
  lintKB,
  type LintResult,
  type LintOptions,
  type LintRule,
} from "./lint.js";

export * from "./resolve.js";

export * from "./render.js";

export {
  builtInLocales,
  mergeMessages,
  messagesFor,
  resolveMessages,
  translateDiagnostic,
  type LocaleOptions,
  type MessageOverrides,
  type Messages,
} from "./i18n/index.js";

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

export * from "./git-source.js";

export * from "./kb.js";

export { exportDocs, type DocPage, type DocsOptions } from "./docs.js";

export { runLint } from "./cli/lint.js";

export { runSearch } from "./cli/search.js";

export { runResolve } from "./cli/resolve.js";

export { runDocs } from "./cli/docs.js";

export { runSimp } from "./cli/simp.js";

export type { CliContext } from "./cli/context.js";

export { fsSource, createValidator, SCHEMA_DIR } from "./platform.js";

export * from "./simp-doc.js";

export * from "./ids.js";

export * from "./links.js";

export * from "./federation/protocol.js";

export * from "./federation/service.js";

export * from "./federation/merge.js";

export * from "./federation/kb.js";

export * from "./simp-index.js";

export { runIndex } from "./cli/index-file.js";
