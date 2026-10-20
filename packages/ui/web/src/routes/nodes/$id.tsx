import { enumDescription } from "../../lib/enum-description.js";
import { label } from "../../lib/utils.js";
import { useState } from "react";
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, kbQuery, nodeQuery } from "../../api.js";
import {
  Badge,
  Button,
  Dialog,
  Textarea,
  ErrorMessage,
  Page,
} from "../../components/ui/primitives.js";
import { Markdown } from "../../components/markdown.js";
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

const muted = "text-[#938c9f]";
const actions = "mt-4.5 flex flex-wrap items-center gap-2.25";

function NodePage() {
  const { id } = Route.useParams();
  return <NodeContent key={id} />;
}

function NodeContent() {
  const { id } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: detail, error } = useQuery(nodeQuery(id));
  const { data: kb } = useQuery(kbQuery);
  const client = useQueryClient();
  const [raw, setRaw] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [plan, setPlan] = useState(false);
  const dirty = raw !== undefined && raw !== detail?.raw;
  const save = useMutation({
    mutationFn: () =>
      api("/files", {
        method: "PUT",
        body: JSON.stringify({
          path: detail!.node.path,
          content: raw ?? detail!.raw,
        }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries();
      setRaw(undefined);
      setSaved(true);
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      api(`/files?path=${encodeURIComponent(detail!.node.path)}`, {
        method: "DELETE",
      }),
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
      !window.confirm("Discard unsaved changes?"),
    enableBeforeUnload: dirty && !remove.isPending && !remove.isSuccess,
  });
  if (!detail)
    return (
      <Page>
        <ErrorMessage error={error} />
        {!error && "Loading node…"}
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
        ← All nodes
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
              View in graph
            </Link>
          </Button>
          {["goal", "procedure"].includes(node.type) && (
            <Button variant="outline" onClick={() => setPlan(true)}>
              Plan
            </Button>
          )}
        </div>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => void navigate({ search: { tab: value } })}
      >
        <TabsList className="my-6">
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
            <h3 className="text-[13px]">Frontmatter</h3>
            <dl className="mb-7.5 border-t border-[#e9e1ee]">
              {Object.entries(node.data).map(([key, value]) => (
                <div
                  key={key}
                  className="grid grid-cols-[120px_minmax(0,1fr)] gap-5 border-b border-[#eee7f3] py-2.75 text-[11px]"
                >
                  <dt className="text-[#a293ae]">{label(key)}</dt>
                  <dd
                    title={
                      ["type", "status", "severity"].includes(key)
                        ? enumDescription(String(value))
                        : undefined
                    }
                    className="m-0 wrap-anywhere text-[#786584]"
                  >
                    {typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
            <Markdown content={node.body} />
            <h3 className="text-[13px]">Relationships</h3>
            {["out", "in"].map((dir) => (
              <section key={dir}>
                <h4>{dir === "out" ? "Outgoing" : "Incoming"}</h4>
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
                  <small className={muted}>None</small>
                )}
              </section>
            ))}
          </div>
          <div className="mt-6 flex h-105 overflow-hidden rounded-[7px] border border-[#e8e0ee] max-[1100px]:mt-0 [&_.react-flow__minimap]:hidden">
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
          <div className="flex items-center justify-between gap-3 text-[#9787a4]">
            <code>{node.path}</code>
            <span className={muted}>
              {dirty
                ? "Unsaved changes"
                : saved
                  ? "Saved to disk"
                  : "Markdown source"}
            </span>
          </div>
          <Textarea
            aria-label="Markdown source"
            disabled={save.isPending}
            className="mt-4 h-[52dvh] min-h-80 bg-card p-5 font-mono text-xs leading-[1.8] [tab-size:2]"
            spellCheck={false}
            value={raw ?? detail.raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setSaved(false);
            }}
          />
          <ErrorMessage error={save.error} />
          <div className={actions}>
            <Button
              variant="default"

              disabled={save.isPending || !dirty}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save file"}
            </Button>
            <Button variant="destructive" onClick={() => setDeleting(true)}>
              Delete file
            </Button>
          </div>
          {issues.map((i, index) => (
            <div key={index} className={issueClass(i.severity)}>
              {i.code} · {i.message}
            </div>
          ))}
        </TabsContent>
        <TabsContent value="docs">
          <h2>Published documentation</h2>
          {docPath ? (
            <>
              <p className={muted}>
                This node contributes to the following live page.
              </p>
              <Button variant="default" asChild>
                <Link
                  to="/docs/$"
                  params={{ _splat: docPath }}
                  search={{ layout: "site" }}
                >
                  Open {docPath}
                </Link>
              </Button>
            </>
          ) : (
            <p className={muted}>
              This node has no docs.path. Add a docs path in Source to include
              it in the site preview.
            </p>
          )}
          <p>
            <Link
              to="/docs/$"
              params={{ _splat: node.path }}
              search={{ layout: "graph" }}
            >
              Browse graph documentation →
            </Link>
          </p>
        </TabsContent>
      </Tabs>
      {deleting && (
        <Dialog open onOpenChange={setDeleting} title="Delete this file?">
          <p>{node.path} will be permanently deleted.</p>
          <p>
            {detail.in.length} nodes reference this node. Their relationships
            will become dangling.
          </p>
          <ErrorMessage error={remove.error} />
          <Button
            variant="destructive"

            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Delete file
          </Button>
        </Dialog>
      )}
      {plan && <Plan id={id} onClose={() => setPlan(false)} />}
    </Page>
  );
}
