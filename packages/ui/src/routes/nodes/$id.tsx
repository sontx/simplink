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
import type { Issue } from "@sontx/simplink-core";
import {
  clearedIssues,
  groupIssuesByFile,
  unparsed,
  issueQueue,
  nextIssue,
} from "../../lib/issues.js";
import {
  Badge,
  Button,
  ErrorMessage,
  Glossary,
  Page,
} from "../../components/ui/primitives.js";
import { Markdown } from "../../components/markdown.js";
import { ConfirmDialog, useConfirm } from "../../components/confirm.js";
import { FrontmatterValue } from "../../components/frontmatter-value.js";
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
  ): { tab?: string; line?: number; issue?: number } => ({
    tab: ["overview", "source", "docs"].includes(String(s.tab))
      ? String(s.tab)
      : "overview",
    ...(Number.isInteger(Number(s.line)) && Number(s.line) > 0
      ? { line: Number(s.line) }
      : {}),
    ...(s.issue !== undefined &&
    Number.isInteger(Number(s.issue)) &&
    Number(s.issue) >= 0
      ? { issue: Number(s.issue) }
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
  const confirm = useConfirm();

  const { id } = Route.useParams();
  const { tab, line, issue: issueParam } = Route.useSearch();
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
  // The file's issues when it was last saved, to report which ones cleared.
  const [savedFrom, setSavedFrom] = useState<readonly Issue[]>([]);
  // The issue being worked on, as an index into this file's issues; -1 for none.
  const [cursor, setCursor] = useState<number>();
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
      // Indexes shift after a re-lint, so Next starts again at this file's first issue.
      setCursor(-1);
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
    shouldBlockFn: async ({ current, next }) =>
      dirty &&
      !remove.isPending &&
      !remove.isSuccess &&
      current.pathname !== next.pathname &&
      !(await confirm({
        title: t("Discard unsaved changes?"),
        description: t("The editor has changes that aren't saved."),
        confirmLabel: t("Discard and leave"),
        destructive: true,
      })),
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
  const queue = issueQueue(files);
  // Arriving from a link picks the issue it names, or the first one on its line.
  const current =
    cursor ??
    issueParam ??
    (line !== undefined ? issues.findIndex((i) => i.line === line) : -1);
  const activeIndex = current < issues.length ? current : -1;
  const { next, position, total } = nextIssue(queue, node.path, activeIndex);
  const cleared = saved ? clearedIssues(savedFrom, issues) : [];
  const canSave = dirty && !save.isPending && !service.store.readOnly;
  // A remote node's issue lines refer to its original files, not this rebuilt source.
  const localLines = service.store.kind !== "remote";
  const saveFile = () => {
    if (!canSave) return;
    setSavedFrom(issues);
    save.mutate();
  };
  saveShortcut.current = saveFile;
  const selectIssue = (index: number) => {
    setCursor(index);
    const target = issues[index]?.line;
    if (localLines && target !== undefined) goToLine(target);
  };
  const nextLabel = (
    <>
      {t("Next issue ({position} of {total})", { position, total })}
      <ArrowRight data-icon="inline-end" />
    </>
  );
  const nextLink =
    next?.file.node &&
    (next.file.path === node.path ? (
      <Button
        variant="outline"
        size="xs"
        onClick={() => selectIssue(next.index)}
      >
        {nextLabel}
      </Button>
    ) : (
      <Button variant="outline" size="xs" asChild>
        <Link
          to="/nodes/$id"
          params={{ id: next.file.node.id }}
          search={{
            tab: "source",
            issue: next.index,
            line: localLines ? next.issue.line : undefined,
          }}
        >
          {nextLabel}
        </Link>
      </Button>
    ));
  // What the last save did to this file's issues.
  const saveResult =
    saved && savedFrom.length > 0
      ? cleared.length > 0
        ? {
            done: true,
            text:
              cleared.length === 1
                ? t("Cleared 1 issue:")
                : t("Cleared {count} issues:", { count: cleared.length }),
          }
        : {
            done: false,
            text:
              unparsed(issues) && !unparsed(savedFrom)
                ? t(
                    "Saved, but the frontmatter no longer parses, so its other issues can't be checked.",
                  )
                : t("Saved. No issues cleared yet."),
          }
      : undefined;
  const clearedCodes = cleared.map((issue, index) => (
    <s
      key={index}
      title={issue.message}
      className="font-mono text-[11px] text-muted-foreground"
    >
      {issue.code}
    </s>
  ));
  return (
    <Page>
      <Link to="/nodes" className={`text-[11px] ${muted}`}>
        {t("← All nodes")}
      </Link>
      <div className="mt-5.5 mb-6.25 flex items-center justify-between gap-6.25 max-[780px]:items-start max-[780px]:gap-2.5">
        <div>
          <Badge type={node.type}>{label(node.type)}</Badge>
          <h1 className="mt-1.25 mb-2">{node.title}</h1>
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
                  className="grid grid-cols-[120px_minmax(0,1fr)] gap-5 border-b border-border py-2.75 text-[11px] max-[480px]:grid-cols-1 max-[480px]:gap-1"
                >
                  <dt className="text-muted-foreground">{label(key)}</dt>
                  <dd className="m-0 wrap-anywhere text-muted-foreground">
                    {key === "sources" && Array.isArray(value) ? (
                      <SourceFiles
                        sources={value.filter(
                          (source): source is string =>
                            typeof source === "string",
                        )}
                      />
                    ) : (
                      <FrontmatterValue value={value} />
                    )}
                    {["type", "status", "severity"].includes(key) &&
                      enumDescription(String(value)) && (
                        <span className="block">
                          {enumDescription(String(value))}
                        </span>
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
                    <Badge>{label(kind)}</Badge>
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
            <Glossary
              className="mt-2"
              summary={t("What these relationships mean")}
              entries={[
                ...new Set(
                  [...detail.out, ...detail.in].map((edge) => edge.kind),
                ),
              ].map((kind) => ({
                key: kind,
                term: label(kind),
                description: enumDescription(kind),
              }))}
            />
          </div>
          <div className="mt-6 flex h-105 overflow-hidden rounded-[7px] border border-border max-[1100px]:mt-0">
            {kb && (
              <KBGraph
                kb={kb}
                focus={id}
                depth={1}
                editable={false}
                minimap={false}
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
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
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
              {saveResult && (
                <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border pb-2.5 text-xs">
                  {saveResult.done && (
                    <CircleCheck
                      className="size-4 shrink-0 text-primary"
                      aria-hidden
                    />
                  )}
                  <span className={saveResult.done ? undefined : muted}>
                    {saveResult.text}
                  </span>
                  {clearedCodes}
                </div>
              )}
              <IssueList
                issues={issues}
                activeIndex={activeIndex}
                onLine={
                  localLines ? (_line, index) => selectIssue(index) : undefined
                }
              />
            </div>
          ) : (
            saveResult && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm">
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-2 font-medium">
                    <CircleCheck className="size-4 text-primary" aria-hidden />
                    {t("No issues left in this file.")}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 pl-6 text-xs text-muted-foreground">
                    {saveResult.text}
                    {clearedCodes}
                  </span>
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
          <p role="status" className="sr-only">
            {saveResult &&
              [
                saveResult.text,
                cleared.map((issue) => issue.code).join(", "),
                !issues.length && t("No issues left in this file."),
              ]
                .filter(Boolean)
                .join(" ")}
          </p>
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
      <ConfirmDialog
        open={deleting}
        title={t("Delete this file?")}
        description={
          <>
            {t("{path} will be permanently deleted.", { path: node.path })}
            {detail.in.length > 0 && (
              <>
                {" "}
                {t(
                  detail.in.length === 1
                    ? "1 node references this node. That relationship will become dangling."
                    : "{count} nodes reference this node. Their relationships will become dangling.",
                  { count: detail.in.length },
                )}
              </>
            )}
          </>
        }
        confirmLabel={t("Delete file")}
        destructive
        pending={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutate()}
        onCancel={() => {
          remove.reset();
          setDeleting(false);
        }}
      />
      {plan && <Plan id={id} onClose={() => setPlan(false)} />}
    </Page>
  );
}
