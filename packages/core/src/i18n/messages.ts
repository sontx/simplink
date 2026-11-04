/**
 * Generated wording used around authored node content in docs pages and rendered plans.
 * Each locale file in this directory implements this contract.
 */
export interface Messages {
  /** Availability labels for plans, alternatives, and choice options. */
  availability: {
    /** Plan can run for the tenant. */
    available: string;
    /** Availability is gated but no tenant context was supplied (plan output). */
    unknown: string;
    /** Availability is gated but no tenant context was supplied (reader-facing docs). */
    docsUnknown: string;
    /** Plan cannot run; reasons are already translated. */
    unavailable: (reasons: string[]) => string;
  };
  /** Constraint severity values; unknown values are shown as authored. */
  severity: Record<string, string>;
  /** Docs export wording. */
  docs: {
    /** Graph-layout headings for outgoing edge kinds. */
    edges: Record<string, string>;
    /** Site-layout headings for outgoing edge kinds. */
    siteEdges: Record<string, string>;
    deprecated: string;
    whenToUse: string;
    check: string;
    severity: string;
    requirementLevel: string;
    plans: string;
    availableOnPlans: string;
    permissions: string;
    requiredPermissions: string;
    aliases: string;
    tags: string;
    choices: string;
    chooseMethod: string;
    referencedBy: string;
    usedInGuides: string;
    recommendedPlan: string;
    steps: string;
    noProcedure: string;
    availability: string;
    deprecatedDependency: string;
    alreadySatisfied: string;
    constraints: string;
    requirements: string;
    failureHandling: string;
    ifSomethingGoesWrong: string;
    alternatives: string;
    deprecatedDependencySuffix: string;
    warnings: string;
  };
  /** Site index pages. */
  site: {
    /** Titles for generated folders, keyed by folder name. */
    sections: Record<string, string>;
    documentation: string;
    homeSummary: string;
    browse: (heading: string) => string;
  };
  /** Reader-facing plan steps in exported docs. */
  docPlan: {
    onlyIf: (refs: string[]) => string;
    check: (ref: string, when: string) => string;
    followFix: (ref: string) => string;
    noFix: string;
    ifNotSatisfied: (action: string) => string;
    selected: (key: string) => string;
    optional: string;
    considerFix: (ref: string) => string;
  };
  /** Plan Markdown rendered for agents (resolve CLI and MCP tools). */
  plan: {
    goal: string;
    procedure: string;
    recommended: string;
    plan: string;
    availability: string;
    alreadySatisfied: string;
    noProcedure: string;
    check: string;
    run: string;
    choose: string;
    how: string;
    ifFalse: string;
    runStep: (step: number | string, ref: string) => string;
    noFix: string;
    onlyIf: (refs: string[]) => string;
    selected: (key: string) => string;
    blockingConstraints: string;
    optional: string;
    considerFix: (ref: string) => string;
    constraints: string;
    alternatives: string;
    stepCount: (count: number) => string;
    warnings: string;
    capabilities: string;
    failureHandling: string;
    omitted: (sections: string[]) => string;
  };
  /** Resolver warnings and unavailability reasons. */
  diagnostics: {
    missingNode: (from: string, id: string) => string;
    missingProcedure: (goal: string, id: string) => string;
    cycle: (id: string) => string;
    maxDepth: (id: string) => string;
    noSatisfier: (state: string) => string;
    noChoiceOption: (choice: string, key: string) => string;
    noAvailableOption: (choice: string) => string;
    requiresPlan: (id: string, plans: string) => string;
    requiresPermission: (id: string, permissions: string) => string;
    requiresPlanGrouped: (plans: string, ids: string) => string;
    requiresPermissionGrouped: (permissions: string, ids: string) => string;
    unreachable: (id: string) => string;
    availabilityNotChecked: (id: string) => string;
  };
}

/** Recursively optional message catalog used to add or reword a language. */
export type MessageOverrides = {
  [K in keyof Messages]?: Messages[K] extends Record<string, unknown>
    ? { [P in keyof Messages[K]]?: Messages[K][P] }
    : Messages[K];
};

/** Language selection shared by docs export and plan rendering. */
export interface LocaleOptions {
  /** BCP 47 language tag such as `vi` or `vi-VN`; unknown tags fall back to English. */
  locale?: string;
  /** Message overrides applied on top of the selected language. */
  messages?: MessageOverrides;
}
