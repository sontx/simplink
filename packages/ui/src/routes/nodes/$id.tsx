import { useWorkspace } from "../../workspace/context.js";
import { usePreferences } from "../../components/preferences.js";
import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { kbQuery, nodeQuery } from "../../api.js";
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
import { issueClass, Plan } from "../../components/inspector.js";
export const Route = createFileRoute("/nodes/$id")({
  validateSearch: (s: Record<string, unknown>): { tab?: string } => ({
    tab: ["overview", "source", "docs"].includes(String(s.tab))
      ? String(s.tab)
      : "overview",
  }),
  component: NodePage,
});

const muted = "text-muted-foreground";
const actions = "mt-4.5 flex flex-wrap items-center gap-2.25";
const SourceEditor = lazy(() => import("../../components/source-editor.js"));

function NodePage() {
  const { id } = Route.useParams();
  return <NodeContent key={id} />;
}

function NodeContent() {
  const { service, setDraftDirty } = useWorkspace();
  const { t, label, enumDescription, theme } = usePreferences();

  const { id } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: detail, error } = useQuery(nodeQuery(service, id));
  const { data: kb } = useQuery(kbQuery(service));
  const client = useQueryClient();
  const [raw, setRaw] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [plan, setPlan] = useState(false);
  const dirty = raw !== undefined && raw !== detail?.raw;
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
  const issues = kb?.issues.filter((i) => i.path === node.path) ?? [];
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
                    ? "Saved in memory"
                    : t("Saved to disk")
                  : t("Markdown source")}
            </span>
          </div>
          <div className="mt-4 h-[52dvh] min-h-80 overflow-hidden rounded-md border border-input">
            <Suspense fallback={t("Loading node…")}>
              <SourceEditor
                nodeType={node.type}
                theme={theme === "dark" ? "vs-dark" : "light"}
                value={raw ?? detail.raw}
                options={{
                  ariaLabel: t("Markdown source"),
                  readOnly: save.isPending || service.store.readOnly,
                  automaticLayout: true,
                  minimap: { enabled: false },
                  lineNumbers: "off",
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

                disabled={save.isPending || !dirty}
                onClick={() => save.mutate()}
              >
                {save.isPending ? t("Saving…") : t("Save file")}
              </Button>
              <Button variant="destructive" onClick={() => setDeleting(true)}>
                {t("Delete file")}
              </Button>
            </div>
          )}
          {issues.map((i, index) => (
            <div key={index} className={issueClass(i.severity)}>
              {i.code} · {i.message}
            </div>
          ))}
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
