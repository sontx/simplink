import { useWorkspace } from "../../workspace/context.js";
import { usePreferences } from "../../components/preferences.js";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CircleCheck } from "lucide-react";
import { kbQuery, nodeQuery } from "../../api.js";
import { IssueCounts, IssueList } from "../../components/issue-list.js";
import { Kbd, KbdGroup } from "../../components/ui/kbd.js";
import { groupIssuesByFile, nextFileWithIssues } from "../../lib/issues.js";
import {
  Badge,
  Button,
  Dialog,
  ErrorMessage,
  Page,
} from "../../components/ui/primitives.js";
import { Markdown } from "../../components/markdown.js";
import { SourceFiles } from "../../components/source-files.js";
import { NodeDocs } from "../../components/node-docs.js";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../../components/ui/tabs.js";
import { KBGraph } from "../../components/kb-graph.js";
import { Plan } from "../../components/inspector.js";
export const Route = createFileRoute("/nodes/$id")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { tab?: string; line?: number } => ({
    tab: ["overview", "source", "docs"].includes(String(s.tab))
      ? String(s.tab)
      : "overview",
    ...(Number.isInteger(Number(s.line)) && Number(s.line) > 0
      ? { line: Number(s.line) }
      : {}),
  }),
  component: NodePage,
});

const muted = "text-muted-foreground";
const actions = "mt-4.5 flex flex-wrap items-center gap-2.25";
const SourceEditor = lazy(() => import("../../components/source-editor.js"));
type EditorInstance = Parameters<
  NonNullable<ComponentProps<typeof SourceEditor>["onMount"]>
>[0];
const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.userAgent);

function NodePage() {
  const { id } = Route.useParams();
  return <NodeContent key={id} />;
}

function NodeContent() {
  const { service, setDraftDirty } = useWorkspace();
  const { t, label, enumDescription, theme } = usePreferences();

  const { id } = Route.useParams();
  const { tab, line } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: detail, error } = useQuery(nodeQuery(service, id));
  const { data: kb } = useQuery(kbQuery(service));
  // Stable per snapshot, so editor markers only move after a save.
  const files = useMemo(
    () => groupIssuesByFile(kb?.issues ?? [], kb?.nodes ?? []),
    [kb],
  );
  const client = useQueryClient();
  const [raw, setRaw] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [plan, setPlan] = useState(false);
  // Whether the file had issues when it was last saved, to confirm a fix.
  const [hadIssues, setHadIssues] = useState(false);
  const saveShortcut = useRef(() => {});
  const editor = useRef<EditorInstance>(undefined);
  // Moves the caret to a source line and centres it.
  const goToLine = (target: number) => {
    const instance = editor.current;
    if (!instance) return;
    instance.revealLineInCenter(target);
    instance.setPosition({ lineNumber: target, column: 1 });
    instance.focus();
  };
  const dirty = raw !== undefined && raw !== detail?.raw;
  useEffect(() => {
    if (tab !== "source") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        saveShortcut.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tab]);
  useEffect(() => {
    setDraftDirty(dirty);
    return () => setDraftDirty(false);
  }, [dirty, setDraftDirty]);
  const save = useMutation({
    mutationFn: () => service.writeFile(detail!.node.path, raw ?? detail!.raw),
    onSuccess: async () => {
      await client.invalidateQueries();
      setRaw(undefined);
      setSaved(true);
    },
  });
  const remove = useMutation({
    mutationFn: () => service.deleteFile(detail!.node.path),
    onSuccess: async () => {
      await client.invalidateQueries();
      void navigate({ to: "/nodes" });
    },
  });
  useBlocker({
    shouldBlockFn: ({ current, next }) =>
      dirty &&
      !remove.isPending &&
      !remove.isSuccess &&
      current.pathname !== next.pathname &&
      !window.confirm(t("Discard unsaved changes?")),
    enableBeforeUnload: dirty && !remove.isPending && !remove.isSuccess,
  });
  if (!detail)
    return (
      <Page>
        <ErrorMessage error={error} />
        {!error && t("Loading node…")}
      </Page>
    );
  const { node } = detail;
  const docs = node.data.docs as { path?: string } | undefined;
  const [, ...segments] = node.path.split("/");
  const filename = segments.pop()!;
  const docPath =
    docs?.path ??
    [
      node.type === "state"
        ? "troubleshooting"
        : node.type === "constraint"
          ? "reference"
          : "guides",
      ...segments,
      ...(node.type === "procedure"
        ? ["how-to"]
        : node.type === "capability"
          ? ["features"]
          : []),
      filename === "index.md" ? "overview.md" : filename,
    ].join("/");
  const file = files.find((group) => group.path === node.path);
  const issues = file?.issues ?? [];
  const { next, position, total } = nextFileWithIssues(files, node.path);
  const canSave = dirty && !save.isPending && !service.store.readOnly;
  // A remote node's issue lines refer to its original files, not this rebuilt source.
  const localLines = service.store.kind !== "remote";
  const saveFile = () => {
    if (!canSave) return;
    setHadIssues(issues.length > 0);
    save.mutate();
  };
  saveShortcut.current = saveFile;
  const nextLink = next?.node && (
    <Button variant="ghost" size="xs" asChild>
      <Link
        to="/nodes/$id"
        params={{ id: next.node.id }}
        search={{ tab: "source" }}
      >
        {position > 0 && total > 1
          ? t("Next file ({position} of {total})", { position, total })
          : t("Next file with issues")}
        <ArrowRight data-icon="inline-end" />
      </Link>
    </Button>
  );
  return (
    <Page>
      <Link to="/nodes" className={`text-[11px] ${muted}`}>
        {t("← All nodes")}
      </Link>
      <div className="mt-5.5 mb-6.25 flex items-center justify-between gap-6.25 max-[780px]:items-start max-[780px]:gap-2.5">
        <div>
          <Badge type={node.type}>{label(node.type)}</Badge>
          <h1 className="mt-1.25 mb-2 max-[780px]:text-[22px]">{node.title}</h1>
          <code className={muted}>{id}</code>
        </div>
        <div className="flex flex-wrap items-center gap-2.25 max-[780px]:justify-end">
          <Button variant="outline" asChild>
            <Link to="/graph" search={{ focus: id }}>
              {t("View in graph")}
            </Link>
          </Button>
          {["goal", "procedure"].includes(node.type) && (
            <Button variant="outline" onClick={() => setPlan(true)}>
              {t("Plan")}
            </Button>
          )}
        </div>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => void navigate({ search: { tab: value } })}
      >
        <TabsList className="mb-4">
          {["overview", "source", "docs"].map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              className="data-active:bg-accent data-active:text-primary"
            >
              {label(value)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent
          value="overview"
          className="grid grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)] gap-11.25 max-[1100px]:grid-cols-1 max-[780px]:gap-3.75"
        >
          <div>
            <div className="font-semibold mb-2">{t("Frontmatter")}</div>
            <dl className="mb-7.5 border-t border-border">
              {Object.entries(node.data).map(([key, value]) => (
                <div
                  key={key}
                  className="grid grid-cols-[120px_minmax(0,1fr)] gap-5 border-b border-border py-2.75 text-[11px]"
                >
                  <dt className="text-muted-foreground">{label(key)}</dt>
                  <dd
                    title={
                      ["type", "status", "severity"].includes(key)
                        ? enumDescription(String(value))
                        : undefined
                    }
                    className="m-0 wrap-anywhere text-muted-foreground"
                  >
                    {key === "sources" && Array.isArray(value) ? (
                      <SourceFiles
                        sources={value.filter(
                          (source): source is string =>
                            typeof source === "string",
                        )}
                      />
                    ) : typeof value === "object" ? (
                      JSON.stringify(value)
                    ) : (
                      String(value)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <Markdown content={node.body} />
            <div className="font-semibold mb-2 mt-6">{t("Relationships")}</div>
            {["out", "in"].map((dir) => (
              <section key={dir}>
                <h4>{dir === "out" ? t("Outgoing") : t("Incoming")}</h4>
                {Object.entries(
                  detail[dir as "out" | "in"].reduce<
                    Record<string, typeof detail.out>
                  >((groups, edge) => {
                    (groups[edge.kind] ??= []).push(edge);
                    return groups;
                  }, {}),
                ).map(([kind, edges]) => (
                  <div
                    className="flex flex-wrap items-center gap-2.5 py-2"
                    key={kind}
                  >
                    <Badge title={enumDescription(kind)}>{label(kind)}</Badge>
                    {edges?.map((edge, index) => {
                      const target = dir === "out" ? edge.to : edge.from;
                      return (
                        <Link
                          key={index}
                          to="/nodes/$id"
                          params={{ id: target }}
                          className="text-[11px]"
                        >
                          {target}
                        </Link>
                      );
                    })}
                  </div>
                ))}
                {!detail[dir as "out" | "in"].length && (
                  <small className={muted}>{t("None")}</small>
                )}
              </section>
            ))}
          </div>
          <div className="mt-6 flex h-105 overflow-hidden rounded-[7px] border border-border max-[1100px]:mt-0 [&_.react-flow__minimap]:hidden">
            {kb && (
              <KBGraph
                kb={kb}
                focus={id}
                depth={1}
                editable={false}
                onFocus={(focus) =>
                  void navigate({ to: "/graph", search: { focus } })
                }
              />
            )}
          </div>
        </TabsContent>
        <TabsContent value="source">
          <div className="flex items-center justify-between gap-3 text-muted-foreground">
            <code>{node.path}</code>
            <span className={muted}>
              {dirty
                ? t("Unsaved changes")
                : saved
                  ? service.store.kind === "memory"
                    ? t("Saved in memory")
                    : t("Saved to disk")
                  : t("Markdown source")}
            </span>
          </div>
          {issues.length > 0 ? (
            <div className="mt-4 rounded-lg border border-border bg-card px-3.5 py-3">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="text-xs font-medium">
                  <IssueCounts
                    errors={file?.errors ?? 0}
                    warnings={file?.warnings ?? 0}
                  />{" "}
                  <span className="font-normal text-muted-foreground">
                    {t("in this file")}
                  </span>
                </span>
                {nextLink}
              </div>
              <IssueList
                issues={issues}
                onLine={localLines ? goToLine : undefined}
              />
            </div>
          ) : (
            saved &&
            hadIssues && (
              <div
                role="status"
                className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm"
              >
                <span className="flex items-center gap-2">
                  <CircleCheck className="size-4 text-primary" aria-hidden />
                  {t("No issues left in this file.")}
                </span>
                {nextLink ??
                  (kb?.issues.length ? (
                    <Link
                      to="/issues"
                      search={{ severity: "" }}
                      className="text-xs"
                    >
                      {t("View remaining issues")}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("Every file is clean.")}
                    </span>
                  ))}
              </div>
            )
          )}
          <div className="mt-4 h-[52dvh] min-h-80 overflow-hidden rounded-md border border-input">
            <Suspense fallback={t("Loading node…")}>
              <SourceEditor
                nodeType={node.type}
                issues={localLines ? issues : undefined}
                onMount={(instance) => {
                  editor.current = instance;
                  if (line) goToLine(line);
                }}
                theme={theme === "dark" ? "vs-dark" : "light"}
                value={raw ?? detail.raw}
                options={{
                  ariaLabel: t("Markdown source"),
                  readOnly: save.isPending || service.store.readOnly,
                  automaticLayout: true,
                  minimap: { enabled: false },
                  lineNumbers: "on",
                  lineNumbersMinChars: 3,
                  fontSize: 12,
                  tabSize: 2,
                  quickSuggestions: {
                    other: true,
                    comments: false,
                    strings: true,
                  },
                  wordWrap: "on",
                  scrollBeyondLastLine: false,
                  padding: { top: 20, bottom: 20 },
                }}
                onChange={(value) => {
                  setRaw(value ?? "");
                  setSaved(false);
                }}
              />
            </Suspense>
          </div>
          <ErrorMessage error={save.error} />
          {!service.store.readOnly && (
            <div className={actions}>
              <Button
                variant="default"
                disabled={!canSave}
                onClick={saveFile}
                aria-keyshortcuts={isMac ? "Meta+S" : "Control+S"}
              >
                {save.isPending ? t("Saving…") : t("Save file")}
              </Button>
              <KbdGroup aria-hidden className="mr-2">
                <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
                <Kbd>S</Kbd>
              </KbdGroup>
              <Button variant="destructive" onClick={() => setDeleting(true)}>
                {t("Delete file")}
              </Button>
            </div>
          )}
        </TabsContent>
        <TabsContent value="docs">
          <NodeDocs docPath={docPath} nodePath={node.path} />
        </TabsContent>
      </Tabs>
      {deleting && (
        <Dialog open onOpenChange={setDeleting} title={t("Delete this file?")}>
          <p>{t("{path} will be permanently deleted.", { path: node.path })}</p>
          <p>
            {t(
              "{count} nodes reference this node. Their relationships will become dangling.",
              { count: detail.in.length },
            )}
          </p>
          <ErrorMessage error={remove.error} />
          <Button
            variant="destructive"

            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {t("Delete file")}
          </Button>
        </Dialog>
      )}
      {plan && <Plan id={id} onClose={() => setPlan(false)} />}
    </Page>
  );
}
