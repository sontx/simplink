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
import { Eyebrow, Page } from "../components/ui/primitives.js";
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
const check =
  "my-2.25 flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground max-[780px]:text-[10px]";

function Graph() {
  const { t, label, enumDescription } = usePreferences();

  const { data: kb } = useQuery(kbQuery);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [expanded, setExpanded] = useState(false);
  // While expanded, the inspector only peeks in after a node is selected.
  const [peek, setPeek] = useState(false);
  const types = ["goal", "procedure", "capability", "state", "constraint"];
  const defaultTypes = ["goal", "procedure", "capability"];
  const selectedTypes = search.types?.split(",") ?? defaultTypes;
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
    <div className="relative flex h-full min-h-132.5 max-[780px]:min-h-full max-[780px]:flex-wrap">
      {!expanded && (
        <aside className="w-55 shrink-0 overflow-auto border-r border-border bg-card px-5.5 py-6.75 max-[1100px]:w-46.25 max-[1100px]:px-3.75 max-[1100px]:py-6.25 max-[780px]:w-37.5 max-[780px]:px-3 max-[780px]:py-5 max-[780px]:text-[10px]">
          <Eyebrow>{t("EXPLORER")}</Eyebrow>
          <h1 className="mb-2 text-[17px] tracking-[-0.4px] max-[780px]:text-sm">
            {t("Knowledge graph")}
          </h1>
          <p className="text-[10px] text-muted-foreground max-[780px]:text-[9px]">
            {kb.nodes.length} {t("nodes")} · {kb.edges.length}{" "}
            {t("relationships")}
          </p>
          <h3 className={heading}>{t("Node types")}</h3>
          {types.map((type) => (
            <label className={check} key={type} title={enumDescription(type)}>
              <Checkbox
                checked={selectedTypes.includes(type)}
                onCheckedChange={() => toggle("types", type, defaultTypes)}
              />
              <span
                className={`${type} size-1.5 rounded-full bg-(--type-color)`}
              />
              {label(type)}
            </label>
          ))}
          <h3 className={heading}>{t("Relationships")}</h3>
          {kinds.map((kind) => (
            <label className={check} key={kind} title={enumDescription(kind)}>
              <Checkbox
                checked={(search.kinds?.split(",") ?? kinds).includes(kind)}
                onCheckedChange={() => toggle("kinds", kind, kinds)}
              />
              {label(kind)}
            </label>
          ))}
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
            <span className={muted}>{orphans.length}</span>
          </h3>
          <div className="flex flex-col gap-1.25">
            {orphans.map((n) => (
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
            ))}
            {!orphans.length && (
              <small className={muted}>
                {t("Every node has an entry point.")}
              </small>
            )}
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
              <Eyebrow>{t("NODE INSPECTOR")}</Eyebrow>
              <h2 className="mt-5.5 mb-2.5 text-[18px] tracking-[-0.4px] text-muted-foreground">
                {t("Explore a connection")}
              </h2>
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
