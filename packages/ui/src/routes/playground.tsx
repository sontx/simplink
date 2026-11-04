import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  NODE_TYPES,
  type ChoiceDef,
  type ToolResult,
} from "@sontx/simplink-core/browser";
import {
  Route as RouteIcon,
  FileText,
  Network,
  ChevronDown,
  ChevronsUpDown,
  Loader2,
  Play,
  ShieldCheck,
  Sparkles,
  Download,
} from "lucide-react";
import { kbQuery, type NodeSummary } from "../api.js";
import { useWorkspace } from "../workspace/context.js";
import { usePreferences } from "../components/preferences.js";
import { Markdown } from "../components/markdown.js";
import { readToolResult } from "../lib/tool-result.js";
import { cn, downloadBlob, groupByType } from "../lib/utils.js";
import {
  Button,
  Input,
  Page,
  ErrorMessage,
  Badge,
} from "../components/ui/primitives.js";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "../components/ui/select.js";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../components/ui/popover.js";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../components/ui/command.js";

export const Route = createFileRoute("/playground")({ component: Playground });

const actions = [
  {
    tool: "search_kb",
    title: "Find answers",
    description: "Describe what you want to do and find a starting point.",
  },
  {
    tool: "resolve_goal",
    title: "Plan a goal",
    description: "Turn a goal into a step-by-step plan.",
  },
  {
    tool: "resolve_procedure",
    title: "Plan a procedure",
    description: "Get guidance for a specific procedure.",
  },
  {
    tool: "get_node",
    title: "View details",
    description: "Read an item and its relationships.",
  },
  {
    tool: "get_related",
    title: "Explore connections",
    description: "See what an item needs and what depends on it.",
  },
] as const;
type Action = (typeof actions)[number];

function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function More({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border bg-muted/30">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          size={16}
          className="text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="space-y-4 border-t px-4 py-4">{children}</div>
    </details>
  );
}

function SectionTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <h3 className={cn("mt-0 mb-3", className)}>{children}</h3>;
}

function Options({
  title,
  value,
  onChange,
  items,
}: {
  title: string;
  value: string;
  onChange(value: string): void;
  items: { value: string; title: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label={title}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.title}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function NodePicker({
  nodes,
  value,
  onChange,
  title,
}: {
  nodes: NodeSummary[];
  value: string;
  onChange(id: string): void;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const { t, label } = usePreferences();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between font-normal"
          aria-label={title}
          role="combobox"
          aria-expanded={open}
        >
          <span className="truncate">
            {nodes.find((n) => n.id === value)?.title ?? t("Choose an item…")}
          </span>
          <ChevronsUpDown size={14} className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-80 p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={t("Search titles or IDs…")} />
          <CommandList>
            <CommandEmpty>{t("No matching targets.")}</CommandEmpty>
            {groupByType(nodes, (n) => n.type).map(([type, group]) => (
              <CommandGroup key={type} heading={label(type)}>
                {group.map((n) => (
                  <CommandItem
                    key={n.id}
                    value={`${n.title} ${n.id}`}
                    onSelect={() => {
                      onChange(n.id);
                      setOpen(false);
                    }}
                  >
                    <span>
                      {n.title}
                      <small className="block font-mono text-muted-foreground">
                        {n.id}
                      </small>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Playground() {
  const [action, setAction] = useState<Action>(actions[0]);
  const [selectedId, setSelectedId] = useState("");
  const { t } = usePreferences();
  return (
    <Page>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-2">{t("Playground")}</h1>
          <p className="text-muted-foreground">
            {t("Explore your knowledge base and try a plan.")}
          </p>
        </div>
        <p className="flex max-w-sm items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck size={14} className="mt-px shrink-0" />
          {t(
            "Plans provide guidance. They do not perform actions or change your files.",
          )}
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav
          className="flex flex-col gap-1 rounded-xl border bg-card p-1.5 max-lg:flex-row max-lg:overflow-x-auto lg:sticky lg:top-4"
          aria-label={t("Actions")}
        >
          {actions.map((a) => {
            const active = action.tool === a.tool;
            return (
              <button
                key={a.tool}
                type="button"
                aria-label={t(a.title)}
                aria-pressed={active}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  active && "bg-accent hover:bg-accent",
                )}
                onClick={() => {
                  setSelectedId("");
                  setAction(a);
                }}
              >
                <span
                  className={cn(
                    "block text-sm font-medium whitespace-nowrap",
                    active && "text-primary",
                  )}
                >
                  {t(a.title)}
                </span>
                <span className="block text-xs text-muted-foreground max-lg:hidden">
                  {t(a.description)}
                </span>
              </button>
            );
          })}
        </nav>
        <ActionForm
          key={`${action.tool}:${selectedId}`}
          action={action}
          initialId={selectedId}
          onNavigate={(tool, id) => {
            setSelectedId(id);
            setAction(actions.find((a) => a.tool === tool)!);
          }}
        />
      </div>
    </Page>
  );
}

function ActionForm({
  action,
  initialId,
  onNavigate,
}: {
  action: Action;
  initialId: string;
  onNavigate(tool: string, id: string): void;
}) {
  const { service } = useWorkspace();
  const { data: kb } = useQuery(kbQuery(service));
  const { t, label } = usePreferences();
  const nodes = kb?.nodes ?? [];
  const [id, setId] = useState(initialId);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [direction, setDirection] = useState("both");
  const [depth, setDepth] = useState("2");
  const [plan, setPlan] = useState("");
  const [permissions, setPermissions] = useState("");
  const [states, setStates] = useState<Record<string, boolean>>({});
  const [choices, setChoices] = useState<Record<string, string>>({});
  const planning =
    action.tool === "resolve_goal" || action.tool === "resolve_procedure";
  const candidates = nodes.filter((n) =>
    action.tool === "resolve_goal"
      ? n.type === "goal"
      : action.tool === "resolve_procedure"
        ? n.type === "procedure"
        : true,
  );
  // Only ask about what the chosen goal or procedure can actually reach.
  const reach = useMemo(
    () =>
      planning && id
        ? service.planInputs(id, choices)
        : { states: [], choices: [] },
    [service, kb, planning, id, choices],
  );
  const stateNodes = reach.states.flatMap((stateId) => {
    const node = nodes.find((n) => n.id === stateId);
    return node ? [node] : [];
  });
  const decisions = reach.choices.flatMap((key) => {
    const at = key.lastIndexOf(":");
    const procedureId = key.slice(0, at);
    const node = nodes.find((n) => n.id === procedureId);
    const choice = (
      (node && service.nodeDetail(procedureId).node.data.choices) as
        ChoiceDef[] | undefined
    )?.find((c) => c.id === key.slice(at + 1));
    return node && choice ? [{ ...choice, key, title: node.title }] : [];
  });
  const pick = <T,>(values: Record<string, T>, keys: string[]) =>
    Object.fromEntries(
      Object.entries(values).filter(([key]) => keys.includes(key)),
    );
  const run = useMutation({
    mutationFn: async () => {
      const args =
        action.tool === "search_kb"
          ? {
              query: query.trim(),
              ...(type !== "all" ? { types: [type] } : {}),
            }
          : planning
            ? {
                [action.tool === "resolve_goal" ? "goal_id" : "procedure_id"]:
                  id,
                states: pick(states, reach.states),
                choices: pick(choices, reach.choices),
                ...(plan.trim() ? { plan: plan.trim() } : {}),
                ...(permissions.trim()
                  ? {
                      permissions: permissions
                        .split(",")
                        .map((p) => p.trim())
                        .filter(Boolean),
                    }
                  : {}),
              }
            : action.tool === "get_related"
              ? { id, direction, depth: Number(depth) }
              : { id, max_body_chars: 20000 };
      const result = await service.callTool(action.tool, args);
      if (result.isError) throw new Error(result.content);
      return readToolResult(result);
    },
  });
  return (
    <div className="min-w-0 space-y-6">
      <form
        className="overflow-hidden rounded-xl border bg-card"
        onSubmit={(event) => {
          event.preventDefault();
          run.mutate();
        }}
      >
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{t(action.title)}</h2>
            <p className="text-sm text-muted-foreground">
              {t(action.description)}
            </p>
          </div>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground max-sm:hidden">
            {action.tool}
          </code>
        </div>
        <div className="max-w-2xl space-y-5 p-5">
          {action.tool === "search_kb" ? (
            <>
              <Field title={t("What would you like to do?")}>
                <Input
                  aria-label={t("What would you like to do?")}
                  placeholder={t("Describe your goal…")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  required
                />
              </Field>
              <Field title={t("Content type")}>
                <Options
                  title={t("Content type")}
                  value={type}
                  onChange={setType}
                  items={[
                    { value: "all", title: t("All types") },
                    ...NODE_TYPES.map((value) => ({
                      value,
                      title: label(value),
                    })),
                  ]}
                />
              </Field>
            </>
          ) : (
            <Field
              title={t(
                action.tool === "resolve_goal"
                  ? "Goal"
                  : action.tool === "resolve_procedure"
                    ? "Procedure"
                    : "Item",
              )}
            >
              <NodePicker
                title={t("Choose an item…")}
                nodes={candidates}
                value={id}
                onChange={(value) => {
                  setId(value);
                  run.reset();
                }}
              />
            </Field>
          )}
          {planning && (
            <More title={t("Tailor your plan")}>
              <p className="text-sm text-muted-foreground">
                {t(
                  !id
                    ? action.tool === "resolve_goal"
                      ? "Choose a goal to see the conditions and decisions its plan depends on."
                      : "Choose a procedure to see the conditions and decisions its plan depends on."
                    : stateNodes.length || decisions.length
                      ? "Leave anything you do not know unanswered. The plan will tell you what to check."
                      : "This plan has no conditions or decisions to answer.",
                )}
              </p>
              {decisions.map((choice) => (
                <Field
                  key={choice.key}
                  title={`${choice.title}: ${choice.question}`}
                >
                  <Options
                    title={choice.question}
                    value={choices[choice.key] ?? "__unanswered"}
                    onChange={(value) =>
                      setChoices((old) => {
                        const next = { ...old };
                        if (value === "__unanswered") delete next[choice.key];
                        else next[choice.key] = value;
                        return next;
                      })
                    }
                    items={[
                      { value: "__unanswered", title: t("Decide later") },
                      ...choice.options.map((o) => ({
                        value: o.key,
                        title: o.when,
                      })),
                    ]}
                  />
                </Field>
              ))}
              {stateNodes.map((n) => (
                <Field key={n.id} title={n.title}>
                  <Options
                    title={n.title}
                    value={
                      states[n.id] === undefined
                        ? "unknown"
                        : String(states[n.id])
                    }
                    onChange={(value) =>
                      setStates((old) => {
                        const next = { ...old };
                        if (value === "unknown") delete next[n.id];
                        else next[n.id] = value === "true";
                        return next;
                      })
                    }
                    items={[
                      { value: "unknown", title: t("Not sure") },
                      { value: "true", title: t("Yes") },
                      { value: "false", title: t("No") },
                    ]}
                  />
                </Field>
              ))}
              <Field title={t("Account plan (optional)")}>
                <Input
                  aria-label={t("Account plan (optional)")}
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                />
              </Field>
              <Field title={t("Permissions (optional, separated by commas)")}>
                <Input
                  aria-label={t("Permissions (optional, separated by commas)")}
                  value={permissions}
                  onChange={(e) => setPermissions(e.target.value)}
                />
              </Field>
            </More>
          )}
          {action.tool === "get_related" && (
            <>
              <Field title={t("Show connections")}>
                <Options
                  title={t("Show connections")}
                  value={direction}
                  onChange={setDirection}
                  items={[
                    { value: "both", title: t("All connections") },
                    { value: "out", title: t("What this needs") },
                    { value: "in", title: t("What depends on this") },
                  ]}
                />
              </Field>
              <Field title={t("How far to explore")}>
                <Options
                  title={t("How far to explore")}
                  value={depth}
                  onChange={setDepth}
                  items={[1, 2, 3].map((n) => ({
                    value: String(n),
                    title: String(n),
                  }))}
                />
              </Field>
            </>
          )}
        </div>
        <div className="flex justify-end border-t bg-muted/30 px-5 py-3">
          <Button
            type="submit"
            disabled={
              run.isPending ||
              (action.tool === "search_kb" ? !query.trim() : !id)
            }
          >
            {run.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} />
            )}
            {t(run.isPending ? "Working…" : action.title)}
          </Button>
        </div>
      </form>
      <ErrorMessage error={run.error} />
      <section
        aria-label={t("Results")}
        aria-live="polite"
        aria-busy={run.isPending}
        className="rounded-xl border bg-card p-5"
      >
        {!run.data && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Sparkles size={20} />
            {t("Run an action to see results here.")}
          </div>
        )}
        {run.data?.warning && (
          <p
            role="status"
            className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
          >
            {t(
              "This knowledge base has validation errors. Results may be incomplete.",
            )}
          </p>
        )}
        {run.data && (
          <Results
            id={id}
            tool={action.tool}
            result={run.data}
            nodes={nodes}
            onNavigate={onNavigate}
          />
        )}
      </section>
    </div>
  );
}

type Item = { id: string; title: string; type?: string; summary?: string };

function MarkdownDownload({
  content,
  name,
}: {
  content: string;
  name: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        downloadBlob(new Blob([content], { type: "text/markdown" }), name)
      }
    >
      <Download /> Markdown
    </Button>
  );
}

function Results({
  id,
  tool,
  result,
  nodes,
  onNavigate,
}: {
  id: string;
  tool: string;
  result: ToolResult;
  nodes: NodeSummary[];
  onNavigate(tool: string, id: string): void;
}) {
  const { t, label } = usePreferences();
  const nodeLink = (id: string) => (
    <Link to="/nodes/$id" params={{ id }} search={{ tab: "overview" }}>
      {nodes.find((n) => n.id === id)?.title ?? id}
    </Link>
  );
  const items = (list: Item[]) =>
    list.length ? (
      <ul className="divide-y rounded-lg border">
        {list.map((item) => (
          <li key={item.id} className="space-y-1 px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5 font-medium">
              {nodeLink(item.id)}
              {item.type && <Badge type={item.type}>{label(item.type)}</Badge>}
              {[
                ["get_node", "View details", FileText] as const,
                ...(item.type === "goal" ||
                item.type === "procedure" ||
                item.id.startsWith("goal.")
                  ? [
                      [
                        item.type === "procedure"
                          ? "resolve_procedure"
                          : "resolve_goal",
                        "Make a plan",
                        RouteIcon,
                      ] as const,
                    ]
                  : []),
                ["get_related", "Explore connections", Network] as const,
              ].map(([tool, title, Icon]) => (
                <Button
                  key={tool}
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label={t(title)}
                  title={t(title)}
                  onClick={() => onNavigate(tool, item.id)}
                >
                  <Icon />
                </Button>
              ))}
            </div>
            {item.summary && (
              <p className="text-sm text-muted-foreground">{item.summary}</p>
            )}
          </li>
        ))}
      </ul>
    ) : (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        {t("No matches. Try different words or filters.")}
      </p>
    );
  if (tool.startsWith("resolve_"))
    return (
      <div>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold my-0">{t("Your plan")}</h3>
          <MarkdownDownload content={result.content} name={`${id}-plan.md`} />
        </div>
        <Markdown content={result.content} />
      </div>
    );
  if (tool === "search_kb") {
    const data = JSON.parse(result.content) as {
      goals?: Item[];
      hits?: Item[];
    };
    return (
      <div>
        <SectionTitle>{t("Suggested goals")}</SectionTitle>
        {items(data.goals ?? [])}
        <SectionTitle className="mt-6">{t("Matching items")}</SectionTitle>
        {items(data.hits ?? [])}
      </div>
    );
  }
  if (tool === "get_related") {
    const data = JSON.parse(result.content) as {
      nodes?: Item[];
      edges?: [string, string, string][];
      truncated?: boolean;
    };
    return (
      <div>
        <SectionTitle>{t("Connected items")}</SectionTitle>
        {items(data.nodes ?? [])}
        <SectionTitle className="mt-6">{t("Relationships")}</SectionTitle>
        <ul className="divide-y rounded-lg border">
          {(data.edges ?? []).map(([from, kind, to]) => (
            <li
              className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm"
              key={`${from}:${kind}:${to}`}
            >
              {nodeLink(from)}
              <span className="text-muted-foreground">{label(kind)} →</span>
              {nodeLink(to)}
            </li>
          ))}
        </ul>
        {data.truncated && (
          <p className="mt-3 text-sm text-muted-foreground">
            {t(
              "Some connections were omitted. Explore a connected item to see more.",
            )}
          </p>
        )}
      </div>
    );
  }
  const data = JSON.parse(result.content) as Item & {
    body?: string;
    body_truncated?: boolean;
    in?: Record<string, string[]>;
    out?: Record<string, string[]>;
    fields?: Record<string, unknown>;
  };
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="my-0 text-xl font-semibold">{nodeLink(data.id)}</h3>
          {data.type && <Badge type={data.type}>{label(data.type)}</Badge>}
          {data.body && (
            <span className="ml-auto">
              <MarkdownDownload content={data.body} name={`${data.id}.md`} />
            </span>
          )}
        </div>
        <code className="font-mono text-xs text-muted-foreground">
          {data.id}
        </code>
        {data.summary && (
          <p className="text-muted-foreground">{data.summary}</p>
        )}
      </div>
      {data.body && <Markdown content={data.body} />}
      {data.body_truncated && (
        <p className="text-sm text-muted-foreground">
          {t("Open the item to read its full content.")}
        </p>
      )}
      {Object.entries(data.fields ?? {}).map(([key, value]) => (
        <div key={key} className="rounded-lg border px-4 py-3">
          <h4 className="mb-1 text-xs font-medium text-muted-foreground">
            {label(key)}
          </h4>
          <p className="text-sm whitespace-pre-wrap">
            {typeof value === "string"
              ? value
              : Array.isArray(value) &&
                  value.every((v) => typeof v === "string")
                ? value.join(", ")
                : t("Open the item for more details.")}
          </p>
        </div>
      ))}
      {(
        [
          ["What this needs", data.out],
          ["What depends on this", data.in],
        ] as const
      ).map(([title, edges]) => (
        <div key={title}>
          <SectionTitle>{t(title)}</SectionTitle>
          {Object.entries(edges ?? {}).map(([kind, ids]) => (
            <div key={kind} className="my-3">
              <span className="text-xs font-medium text-muted-foreground">
                {label(kind)}
              </span>
              <ul className="mt-1 ml-5 list-disc text-sm">
                {ids.map((id) => (
                  <li key={id}>{nodeLink(id)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
