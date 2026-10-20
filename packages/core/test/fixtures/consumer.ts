import {
  createKB,
  createKBTools,
  memorySource,
  runLint,
  createMiniSearchEngine,
  defaultAvailability,
  defaultRank,
  renderResolvedGoal,
  type MaybePromise,
  type DocSource,
  type SourceFile,
  type RawDoc,
  type FrontmatterValidator,
  type ValidatorExtension,
  type SchemaFinding,
  type LintRule,
  type LintOptions,
  type SearchMatch,
  type EngineSearchOptions,
  type SearchEngine,
  type SearchEngineFactory,
  type MiniSearchEngineOptions,
  type AsyncKBSearch,
  type AvailabilityPolicy,
  type AlternativeComparator,
  type RankedCandidate,
  type TenantContext,
  type RenderSection,
  type PlanRenderer,
  type KB,
  type KBExtensions,
  type KBStatus,
  type KBToolSpec,
  type CliContext,
} from "@sontx/simplink-core";

const files: SourceFile[] = [];
const source: DocSource = { list: async (): Promise<SourceFile[]> => files };
const validator: FrontmatterValidator = (): SchemaFinding[] => [];
const asyncValidator: ValidatorExtension = async (type, data) =>
  validator(type, data);
const rule: LintRule = async () => [];
const lint: LintOptions = {
  validator: asyncValidator,
  rules: [rule],
  disable: ["W101"],
};
const engineOptions: EngineSearchOptions = {
  fuzzy: false,
  prefix: false,
  candidateLimit: 20,
};
const match: SearchMatch = { id: "procedure.a", score: 1 };
const engine: SearchEngine = { search: async () => [match] };
const search: SearchEngineFactory = async () => engine;
const miniOptions: MiniSearchEngineOptions = {
  stopwords: new Set(),
  fold: (s) => s.toLowerCase(),
  boosts: { title: 8 },
};
const tenant: TenantContext = { context: { entitled: true } };
const availability: AvailabilityPolicy = defaultAvailability;
const rank: AlternativeComparator = (a: RankedCandidate, b: RankedCandidate) =>
  defaultRank(a, b);
const section: RenderSection = { name: "footer", priority: 1, text: "Footer" };
const renderer: PlanRenderer = async (resolved, options) =>
  renderResolvedGoal(resolved, {
    ...options,
    sections: (defaults) => [...defaults, section],
  });
const extensions: KBExtensions = {
  validator: asyncValidator,
  lint,
  search,
  resolve: { tenant, availability, rank },
  renderer,
};
const kb: KB = await createKB(source, extensions);
const status: KBStatus = kb.status;
const spec: KBToolSpec = {
  definition: {
    name: "custom",
    description: "Example",
    inputSchema: { type: "object" },
  },
  handler: async (_, current) => ({ content: current.status.root }),
};
await createKBTools(kb, { tools: (defaults) => [...defaults, spec] });
const ctx: CliContext = { extensions, stdout: console.log };
const eventual: MaybePromise<number> = runLint([], ctx);
void [
  memorySource,
  createMiniSearchEngine,
  miniOptions,
  engineOptions,
  status,
  eventual,
];
const raw: RawDoc | undefined = undefined;
const asyncSearch: AsyncKBSearch | undefined = undefined;
void [raw, asyncSearch];
