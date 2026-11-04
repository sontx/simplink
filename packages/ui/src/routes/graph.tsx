import { useWorkspace } from "../workspace/context.js";
import { usePreferences } from "../components/preferences.js";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { kbQuery } from "../api.js";
import { KBGraph } from "../components/kb-graph.js";
import { Inspector, inspectorClass } from "../components/inspector.js";
import { Checkbox } from "../components/ui/checkbox.js";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group.js";
import { Button } from "../components/ui/button.js";
import {
  ChevronDown,
  CircleCheck,
  LocateFixed,
  Map as MapIcon,
  Plus,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { IssueCounts } from "../components/issue-list.js";
import {
  groupState,
  relationshipGroups,
  toggleGroup,
} from "../lib/relationship-groups.js";
import { NodeDialog } from "../components/node-dialog.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.js";
import { cn } from "../lib/utils.js";
import { Glossary, Page } from "../components/ui/primitives.js";
import {
  nodeArea,
  orphanNodes,
  startNode,
  type StartReason,
} from "../graph.js";
export const Route = createFileRoute("/graph")({
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    focus?: string;
    depth?: number | "all";
    types?: string;
    kinds?: string;
    deprecated?: boolean;
    issuesOnly?: boolean;
    map?: boolean;
  } => ({
    focus: typeof s.focus === "string" ? s.focus : undefined,
    depth:
      s.depth === "all"
        ? ("all" as const)
        : [1, 2, 3].includes(Number(s.depth))
          ? Number(s.depth)
          : undefined,
    types: typeof s.types === "string" ? s.types : undefined,
    kinds: typeof s.kinds === "string" ? s.kinds : undefined,
    deprecated:
      s.deprecated === true || s.deprecated === "true" ? true : undefined,
    issuesOnly:
      s.issuesOnly === true || s.issuesOnly === "true" ? true : undefined,
    map: s.map === true || s.map === "true" ? true : undefined,
  }),
  component: Graph,
});

// Section labels under the page h1: h2 in the outline, small in the panel.
const heading = "mt-6 mb-2.75 text-xs leading-normal font-[650]";
const ORPHAN_PREVIEW = 5;
const types = ["goal", "procedure", "capability", "state", "constraint"];
// Why the graph opened on this node; shown beside it on the canvas.
const startReasons: Record<StartReason, string> = {
  error: "Has a lint error",
  warning: "Has a lint warning",
  orphan: "Nothing points here",
  edited: "You edited this last",
  goal: "Most connected goal",
};
const check =
  "my-2.25 flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground";
// Filters are settings, not the author's current action, so their checks use
// plum ink rather than Simp Pink (the One Pen Rule).
const plumCheck =
  "data-checked:border-foreground data-checked:bg-foreground data-checked:text-background dark:data-checked:bg-foreground data-[state=indeterminate]:border-foreground data-[state=indeterminate]:bg-foreground data-[state=indeterminate]:text-background";

function Graph() {
  const { service } = useWorkspace();
  const { t, label, enumDescription } = usePreferences();

  const { data: kb } = useQuery(kbQuery(service));
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [expanded, setExpanded] = useState(false);
  // While expanded, the inspector only peeks in after a node is selected.
  const [peek, setPeek] = useState(false);
  // The keyboard path to a new node; right-clicking the canvas is the pointer one.
  const [create, setCreate] = useState<string>();
  // Below 780px the filters fold away so the canvas keeps the screen.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [allOrphans, setAllOrphans] = useState(false);
  const selectedTypes = search.types?.split(",") ?? types;
  const kinds = [...new Set(kb?.edges.map((e) => e.kind) ?? [])];
  const groups = relationshipGroups(kinds);
  const selectedKinds = search.kinds?.split(",") ?? kinds;
  const update = (next: Partial<typeof search>) =>
    void navigate({ search: (old) => ({ ...old, ...next }) });
  const toggle = (key: "types" | "kinds", value: string, all: string[]) => {
    const selected = search[key]?.split(",") ?? all;
    update({
      [key]: (selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
      ).join(","),
    });
  };
  if (!kb) return <Page>{t("Loading graph…")}</Page>;
  const orphans = orphanNodes(kb.nodes, kb.edges);
  // With nothing chosen, open where attention belongs instead of a fit-all map.
  const start =
    search.focus || search.map
      ? undefined
      : startNode(kb.nodes, kb.edges, kb.issues, kb.lastEdited);
  const focus = search.focus ?? start?.id;
  const focusNode = kb.nodes.find((n) => n.id === focus);
  const depth = search.depth ?? (focus ? 2 : "all");
  const canvasPanel = (
    <div className="flex max-w-full items-center gap-2 rounded-lg border border-border bg-card py-1 pr-1 pl-2.5 text-[11px] shadow-[0_1px_6px_#41344712]">
      {focusNode ? (
        <>
          <span className="min-w-0 truncate">
            <span className="font-medium text-foreground">
              {focusNode.title}
            </span>
            {start && (
              <span className="text-muted-foreground">
                {" · "}
                {t(startReasons[start.reason])}
              </span>
            )}
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0"
            onClick={() => update({ focus: undefined, map: true })}
          >
            <MapIcon data-icon="inline-start" />
            {t("Whole map")}
          </Button>
        </>
      ) : (
        <>
          <span className="whitespace-nowrap text-muted-foreground">
            {t("Whole map")}
            <span className="max-[780px]:hidden">
              {" · "}
              {t("{count} nodes in {areas} areas", {
                count: kb.nodes.length,
                areas: new Set(kb.nodes.map((n) => nodeArea(n.path))).size,
              })}
            </span>
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0"
            onClick={() => update({ map: undefined, depth: undefined })}
          >
            <LocateFixed data-icon="inline-start" />
            {t("Open where it matters")}
          </Button>
        </>
      )}
    </div>
  );
  return (
    <div className="relative flex h-full min-h-132.5 max-[780px]:min-h-full max-[780px]:flex-col">
      {!expanded && (
        <aside className="w-55 shrink-0 overflow-auto border-r border-border bg-card px-5.5 py-6.75 max-[1100px]:w-46.25 max-[1100px]:px-3.75 max-[1100px]:py-6.25 max-[780px]:max-h-[55%] max-[780px]:w-full max-[780px]:border-r-0 max-[780px]:border-b max-[780px]:px-4 max-[780px]:py-3">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="mb-2 text-xl leading-[1.35] font-semibold tracking-normal max-[780px]:mb-0.5 max-[780px]:text-sm">
                {t("Knowledge graph")}
              </h1>
              <p className="text-[11px] text-muted-foreground">
                {kb.nodes.length} {t("nodes")} · {kb.edges.length}{" "}
                {t("relationships")}
              </p>
              {!service.store.readOnly && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 max-[780px]:mt-2"
                    >
                      <Plus data-icon="inline-start" />
                      {t("New node")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {types.map((type) => (
                      <DropdownMenuItem
                        key={type}
                        onSelect={() => setCreate(type)}
                      >
                        <span
                          aria-hidden
                          className={`${type} size-1.5 rounded-full bg-(--type-color)`}
                        />
                        {label(type)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="min-[780px]:hidden"
              aria-expanded={filtersOpen}
              aria-controls="graph-filters"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              {t("Filters")}
              <ChevronDown
                className={cn(
                  "transition-transform",
                  filtersOpen && "rotate-180",
                )}
              />
            </Button>
          </div>
          {/* Problems first: what is broken or unreachable leads the panel. */}
          <section
            aria-label={t("Health")}
            className="mt-4 border-y border-border py-3 text-[11px] max-[780px]:mt-2.5 max-[780px]:py-2"
          >
            {kb.status.errors || kb.status.warnings ? (
              <Link to="/issues" search={{ severity: "" }} className="block">
                <IssueCounts
                  errors={kb.status.errors}
                  warnings={kb.status.warnings}
                  className="text-[11px]"
                />
              </Link>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <CircleCheck aria-hidden className="size-3.5 text-success" />
                {t("No lint issues")}
              </span>
            )}
            {orphans.length ? (
              <details className="group/orphans mt-1.5">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-warning select-none [&::-webkit-details-marker]:hidden">
                  {orphans.length === 1
                    ? t("1 orphan")
                    : t("{count} orphans", { count: orphans.length })}
                  <ChevronDown
                    aria-hidden
                    className="size-3.5 transition-transform group-open/orphans:rotate-180"
                  />
                </summary>
                <p className="mt-1.5 mb-1 text-muted-foreground">
                  {t("Nothing points to these nodes, so no goal reaches them.")}
                </p>
                <div className="-mx-2.5 flex flex-col">
                  {(allOrphans
                    ? orphans
                    : orphans.slice(0, ORPHAN_PREVIEW)
                  ).map((n) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      key={n.id}
                      className="h-auto flex-col items-start gap-0 py-1.5 text-left text-xs whitespace-normal"
                      onClick={() => update({ focus: n.id })}
                    >
                      {n.title}
                      <span className="max-w-full truncate font-mono text-[11px] font-normal text-muted-foreground">
                        {n.id}
                      </span>
                    </Button>
                  ))}
                </div>
                {orphans.length > ORPHAN_PREVIEW && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto px-0 text-[11px]"
                    aria-expanded={allOrphans}
                    onClick={() => setAllOrphans((all) => !all)}
                  >
                    {allOrphans
                      ? t("Show fewer")
                      : t("Show all {count}", { count: orphans.length })}
                  </Button>
                )}
              </details>
            ) : (
              <span className="mt-1.5 block text-muted-foreground">
                {t("Every node has an entry point.")}
              </span>
            )}
          </section>
          <div
            id="graph-filters"
            className={cn(!filtersOpen && "max-[780px]:hidden")}
          >
            <h2 className={heading}>{t("Node types")}</h2>
            {types.map((type) => (
              <label className={check} key={type}>
                <Checkbox
                  className={plumCheck}
                  checked={selectedTypes.includes(type)}
                  onCheckedChange={() => toggle("types", type, types)}
                />
                <span
                  className={`${type} size-1.5 rounded-full bg-(--type-color)`}
                />
                {label(type)}
              </label>
            ))}
            <Glossary
              className="mt-1"
              summary={t("What these types mean")}
              entries={types.map((type) => ({
                key: type,
                term: label(type),
                description: enumDescription(type),
              }))}
            />
            <h2 className={heading}>{t("Relationships")}</h2>
            {groups.map((group) => (
              <label className={check} key={group.key}>
                <Checkbox
                  className={plumCheck}
                  checked={groupState(group.kinds, selectedKinds)}
                  onCheckedChange={() =>
                    update({
                      kinds: toggleGroup(group.kinds, selectedKinds).join(","),
                    })
                  }
                />
                {t(group.title)}
              </label>
            ))}
            <details className="group/kinds mt-1 text-[11px]">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronDown
                  aria-hidden
                  className="size-3.5 -rotate-90 transition-transform group-open/kinds:rotate-0"
                />
                {t("Each relationship")}
              </summary>
              {groups.map((group) => (
                <div key={group.key} className="mt-2.5 ml-1.5">
                  <div className="text-muted-foreground">{t(group.title)}</div>
                  {group.kinds.map((kind) => (
                    <label
                      className={cn(check, "my-1.5 ml-1 items-start")}
                      key={kind}
                      title={enumDescription(kind)}
                    >
                      <Checkbox
                        className={plumCheck}
                        checked={selectedKinds.includes(kind)}
                        onCheckedChange={() => toggle("kinds", kind, kinds)}
                      />
                      <span>
                        {label(kind)}
                        {enumDescription(kind) && (
                          <span className="block text-muted-foreground/80">
                            {enumDescription(kind)}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </details>
            <h2 className={heading}>{t("Depth")}</h2>
            <ToggleGroup
              className="mt-2 mb-4"
              type="single"
              variant="outline"
              value={String(depth)}
              onValueChange={(value) =>
                value &&
                update({ depth: value === "all" ? "all" : Number(value) })
              }
              aria-label={t("Graph depth")}
            >
              {[1, 2, 3, "all"].map((depth) => (
                <ToggleGroupItem
                  className="data-[state=on]:text-primary-ink"
                  key={depth}
                  value={String(depth)}
                  aria-label={
                    depth === "all"
                      ? t("All depths")
                      : t("Depth {depth}", { depth })
                  }
                >
                  {label(String(depth))}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <label className={check}>
              <Checkbox
                className={plumCheck}
                checked={!!search.deprecated}
                onCheckedChange={(checked) =>
                  update({ deprecated: checked === true || undefined })
                }
              />
              {t("Show deprecated")}
            </label>
            <label className={check}>
              <Checkbox
                className={plumCheck}
                checked={!!search.issuesOnly}
                onCheckedChange={(checked) =>
                  update({ issuesOnly: checked === true || undefined })
                }
              />
              {t("Only with issues")}
            </label>
          </div>
        </aside>
      )}
      <KBGraph
        kb={kb}
        focus={focus}
        depth={depth}
        overview={!focus}
        panel={canvasPanel}
        filters={{
          types: selectedTypes,
          kinds: search.kinds?.split(","),
          deprecated: search.deprecated,
          issuesOnly: search.issuesOnly,
          issuePaths: new Set(kb.issues.map((i) => i.path)),
        }}
        onFocus={(id) => {
          setPeek(true);
          update({ focus: id, map: undefined });
        }}
        onPaneClick={() => setPeek(false)}
        expanded={expanded}
        onExpandedChange={(next) => {
          setExpanded(next);
          setPeek(false);
        }}
      />
      {focusNode
        ? (!expanded || peek) && (
            <Inspector
              key={focusNode.id}
              id={focusNode.id}
              className={cn(
                expanded &&
                  "absolute inset-y-0 right-0 z-10 shadow-[-10px_0_30px_#3b204410]",
                // On a phone the inspector covers the canvas, so it waits for a tap.
                !peek && "max-[780px]:hidden",
              )}
              onClose={() => setPeek(false)}
            />
          )
        : !expanded && (
            <aside
              className={`${inspectorClass} text-muted-foreground min-[1100px]:pt-9.5 max-[780px]:hidden`}
            >
              <h2 className="mb-2.5">{t("Whole map")}</h2>
              <p className="text-xs leading-[1.7]">
                {t(
                  "Each card is an area folder. Select one to open its most connected node.",
                )}
              </p>
              {!service.store.readOnly && (
                <small className="mt-5 block leading-[1.7]">
                  {t("Use New node, or right-click the canvas, to create one.")}
                </small>
              )}
            </aside>
          )}
      {create && (
        <NodeDialog
          type={create}
          onClose={() => setCreate(undefined)}
          onCreated={(id) => update({ focus: id })}
        />
      )}
    </div>
  );
}
