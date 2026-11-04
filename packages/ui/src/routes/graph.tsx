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
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils.js";
import { Glossary, Page } from "../components/ui/primitives.js";
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
  }),
  component: Graph,
});

const muted = "text-muted-foreground";
const heading = "mt-6 mb-2.75";
const ORPHAN_PREVIEW = 5;
const types = ["goal", "procedure", "capability", "state", "constraint"];
const check =
  "my-2.25 flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground";

function Graph() {
  const { service } = useWorkspace();
  const { t, label, enumDescription } = usePreferences();

  const { data: kb } = useQuery(kbQuery(service));
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [expanded, setExpanded] = useState(false);
  // While expanded, the inspector only peeks in after a node is selected.
  const [peek, setPeek] = useState(false);
  // Below 780px the filters fold away so the canvas keeps the screen.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [allOrphans, setAllOrphans] = useState(false);
  const selectedTypes = search.types?.split(",") ?? types;
  const kinds = [...new Set(kb?.edges.map((e) => e.kind) ?? [])];
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
  const orphans = kb.nodes.filter(
    (n) => n.type !== "goal" && !kb.edges.some((e) => e.to === n.id),
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
          <div
            id="graph-filters"
            className={cn(!filtersOpen && "max-[780px]:hidden")}
          >
            <h3 className={heading}>{t("Node types")}</h3>
            {types.map((type) => (
              <label className={check} key={type}>
                <Checkbox
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
            <h3 className={heading}>{t("Relationships")}</h3>
            {kinds.map((kind) => (
              <label className={check} key={kind}>
                <Checkbox
                  checked={(search.kinds?.split(",") ?? kinds).includes(kind)}
                  onCheckedChange={() => toggle("kinds", kind, kinds)}
                />
                {label(kind)}
              </label>
            ))}
            <Glossary
              className="mt-1"
              summary={t("What these relationships mean")}
              entries={kinds.map((kind) => ({
                key: kind,
                term: label(kind),
                description: enumDescription(kind),
              }))}
            />
            <h3 className={heading}>{t("Depth")}</h3>
            <ToggleGroup
              className="mt-2 mb-4"
              type="single"
              variant="outline"
              value={String(search.depth ?? (search.focus ? 2 : 1))}
              onValueChange={(value) =>
                value &&
                update({ depth: value === "all" ? "all" : Number(value) })
              }
              aria-label={t("Graph depth")}
            >
              {[1, 2, 3, "all"].map((depth) => (
                <ToggleGroupItem
                  className="data-[state=on]:text-primary"
                  key={depth}
                  value={String(depth)}
                  aria-label={t("Depth {depth}", { depth })}
                >
                  {label(String(depth))}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <label className={check}>
              <Checkbox
                checked={!!search.deprecated}
                onCheckedChange={(checked) =>
                  update({ deprecated: checked === true || undefined })
                }
              />
              {t("Show deprecated")}
            </label>
            <label className={check}>
              <Checkbox
                checked={!!search.issuesOnly}
                onCheckedChange={(checked) =>
                  update({ issuesOnly: checked === true || undefined })
                }
              />
              {t("Only with issues")}
            </label>
            <h3 className={heading}>
              {t("Orphans")}
              <span className={`${muted} ml-1.5 font-normal`}>
                {orphans.length}
              </span>
            </h3>
            <div className="flex flex-col gap-1.25">
              {(allOrphans ? orphans : orphans.slice(0, ORPHAN_PREVIEW)).map(
                (n) => (
                  <Button
                    variant="ghost"
                    key={n.id}
                    className="h-auto flex-col items-start gap-0.5 text-left whitespace-normal"
                    onClick={() => update({ focus: n.id })}
                  >
                    {n.title}
                    <span className="max-w-full truncate text-xs text-muted-foreground">
                      {n.id}
                    </span>
                  </Button>
                ),
              )}
              {orphans.length > ORPHAN_PREVIEW && (
                <Button
                  variant="link"
                  size="sm"
                  className="self-start px-3"
                  aria-expanded={allOrphans}
                  onClick={() => setAllOrphans((all) => !all)}
                >
                  {allOrphans
                    ? t("Show fewer")
                    : t("Show all {count}", { count: orphans.length })}
                </Button>
              )}
              {!orphans.length && (
                <small className={muted}>
                  {t("Every node has an entry point.")}
                </small>
              )}
            </div>
          </div>
        </aside>
      )}
      <KBGraph
        kb={kb}
        focus={search.focus}
        depth={search.depth ?? (search.focus ? 2 : 1)}
        filters={{
          types: selectedTypes,
          kinds: search.kinds?.split(","),
          deprecated: search.deprecated,
          issuesOnly: search.issuesOnly,
          issuePaths: new Set(kb.issues.map((i) => i.path)),
        }}
        onFocus={(id) => {
          setPeek(true);
          update({ focus: id });
        }}
        onPaneClick={() => setPeek(false)}
        expanded={expanded}
        onExpandedChange={(next) => {
          setExpanded(next);
          setPeek(false);
        }}
      />
      {search.focus && kb.nodes.some((n) => n.id === search.focus)
        ? (!expanded || peek) && (
            <Inspector
              key={search.focus}
              id={search.focus}
              className={
                expanded
                  ? "absolute inset-y-0 right-0 z-10 shadow-[-10px_0_30px_#3b204410]"
                  : undefined
              }
            />
          )
        : !expanded && (
            <aside
              className={`${inspectorClass} text-muted-foreground min-[1100px]:pt-9.5 max-[780px]:hidden`}
            >
              <h2 className="mb-2.5">{t("Explore a connection")}</h2>
              <p className="text-xs leading-[1.7]">
                {t(
                  "Select a node to inspect its relationships and edit its source.",
                )}
              </p>
              <small className="mt-5 block leading-[1.7]">
                {t("Right-click the canvas to create a node.")}
              </small>
            </aside>
          )}
    </div>
  );
}
