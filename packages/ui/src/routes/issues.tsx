import { useWorkspace } from "../workspace/context.js";
import { usePreferences } from "../components/preferences.js";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleCheck, Undo2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DeletedNotice } from "../components/deleted-notice.js";
import { kbQuery } from "../api.js";
import {
  Badge,
  Button,
  ErrorMessage,
  Page,
} from "../components/ui/primitives.js";
import {
  IssueCodeGuide,
  IssueCounts,
  IssueList,
} from "../components/issue-list.js";
import { groupIssuesByFile, issueQueue } from "../lib/issues.js";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "../components/ui/select.js";
export const Route = createFileRoute("/issues")({
  validateSearch: (s: Record<string, unknown>) => ({
    severity:
      s.severity === "error" || s.severity === "warning" ? s.severity : "",
  }),
  component: Issues,
});

// Files whose path maps to no node id (simp.md, invalid file names) have no
// editor here; where to fix them depends on the store.
const unopenedFileHint = {
  directory:
    "This file can't be opened here. Fix it in your editor, then Reload.",
  memory:
    "This file can't be opened here. Download the KB to keep your edits, fix the file in your editor, then open the folder again.",
  remote: "Fix this file in the simp node's own folder.",
} as const;

function Issues() {
  const { service } = useWorkspace();
  const { t, label } = usePreferences();

  const { data: kb } = useQuery(kbQuery(service));
  const client = useQueryClient();
  const { severity } = Route.useSearch();
  const navigate = Route.useNavigate();
  const issues =
    kb?.issues.filter((i) => !severity || i.severity === severity) ?? [];
  const files = groupIssuesByFile(issues, kb?.nodes ?? []);
  const errors = files.reduce((sum, file) => sum + file.errors, 0);
  const warnings = files.reduce((sum, file) => sum + file.warnings, 0);
  // The fix loop starts at the first issue the Source tab can open. Indexes
  // must match its unfiltered list, so the severity filter only picks which issue.
  // Broken references grouped by cause: one missing node, everything pointing at it.
  const known = new Set(kb?.nodes.map((n) => n.id));
  const missing = new Map<string, NonNullable<typeof kb>["nodes"]>();
  if (severity !== "warning")
    for (const e of kb?.edges ?? []) {
      // `<simp>:<id>` references live in other KBs; peers check those.
      if (known.has(e.to) || e.to.includes(":")) continue;
      const from = kb!.nodes.find((n) => n.id === e.from);
      const list = missing.get(e.to) ?? [];
      if (from && !list.includes(from)) list.push(from);
      missing.set(e.to, list);
    }
  const restore = useMutation({
    mutationFn: () => service.restoreDeleted(),
    onSettled: () => client.invalidateQueries(),
  });
  const first = issueQueue(
    groupIssuesByFile(kb?.issues ?? [], kb?.nodes ?? []),
  ).find((item) => !severity || item.issue.severity === severity);
  return (
    <Page>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6.25 gap-y-4 max-[780px]:gap-x-2.5">
        <div className="min-w-0">
          <h1 className="mb-1.5">{t("Issues")}</h1>
          {files.length > 0 && (
            <p className="mb-0 text-sm text-muted-foreground">
              <IssueCounts
                errors={errors}
                warnings={warnings}
                className="text-sm"
              />{" "}
              {files.length === 1
                ? t("in 1 file")
                : t("in {count} files", { count: files.length })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.25">
          <Select
            value={severity || "all"}
            onValueChange={(value) =>
              void navigate({
                search: { severity: value === "all" ? "" : value },
              })
            }
          >
            <SelectTrigger aria-label={t("Severity")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t("All severities")}</SelectItem>
                <SelectItem value="error">{t("Errors")}</SelectItem>
                <SelectItem value="warning">{t("Warnings")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {first?.file.id && !service.store.readOnly && (
            <Button asChild>
              <Link
                to="/nodes/$id"
                params={{ id: first.file.id }}
                search={{
                  tab: "source",
                  issue: first.index,
                  line: first.issue.line,
                }}
              >
                {t("Start fixing")}
              </Link>
            </Button>
          )}
        </div>
      </div>
      <DeletedNotice className="mb-5" />
      {missing.size > 0 && (
        <section aria-labelledby="missing-nodes" className="mb-7">
          <h2 id="missing-nodes" className="mb-1 text-sm font-semibold">
            {t("Missing nodes")}
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {t(
              "Each of these is referenced but doesn't exist. Restore it, or fix the references below.",
            )}
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {[...missing].map(([target, from]) => (
              <li
                key={target}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-3.5 py-2.5"
              >
                <div className="min-w-0 text-sm">
                  <code className="font-medium wrap-anywhere text-foreground">
                    {target}
                  </code>
                  <p className="mt-1 mb-0 text-xs text-muted-foreground">
                    {from.length === 1
                      ? t("Referenced by 1 node:")
                      : t("Referenced by {count} nodes:", {
                          count: from.length,
                        })}{" "}
                    {from.map((n, i) => (
                      <span key={n.id}>
                        {i > 0 && ", "}
                        <Link
                          to="/nodes/$id"
                          params={{ id: n.id }}
                          search={{ tab: "source" }}
                          className="text-foreground underline decoration-border underline-offset-3 hover:text-primary-ink hover:decoration-current"
                        >
                          {n.title}
                        </Link>
                      </span>
                    ))}
                  </p>
                </div>
                {kb?.deleted?.id === target && !service.store.readOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate()}
                  >
                    <Undo2 data-icon="inline-start" />
                    {t("Restore node")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <ErrorMessage error={restore.error} className="mt-2" />
        </section>
      )}
      {!files.length && (
        <div className="px-6.25 py-17.5 text-center text-muted-foreground">
          <CircleCheck
            aria-hidden
            className="mx-auto mb-3 size-7 text-success"
            strokeWidth={1.75}
          />
          <h2 className="text-foreground">{t("All clear")}</h2>
          <p className="text-muted-foreground">
            {kb?.issues.length
              ? t("No issues match this view.")
              : // The same summary simp-lint prints, so the UI and the CLI visibly agree.
                t(
                  "{nodes} nodes, {edges} relationships, 0 errors, 0 warnings. simp-lint passes.",
                  {
                    nodes: kb?.nodes.length ?? 0,
                    edges: kb?.edges.length ?? 0,
                  },
                )}
          </p>
        </div>
      )}
      {files.length > 0 && (
        <div className="border-t border-border">
          {files.map(({ path, node, id, type, issues, errors, warnings }) => {
            // A remote node's lines refer to its original files, not the rebuilt source.
            const openAt = (line?: number) => ({
              tab: "source",
              line: service.store.kind !== "remote" ? line : undefined,
            });
            return (
              <section
                key={path}
                aria-label={node?.title ?? path}
                className="border-b border-border py-5"
              >
                <div className="flex items-start justify-between gap-5 max-[780px]:flex-col max-[780px]:items-stretch max-[780px]:gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-start gap-2">
                      {type && <Badge type={type}>{label(type)}</Badge>}
                      <h2 className="m-0 min-w-0 text-sm leading-5 font-semibold wrap-anywhere">
                        {node?.title ?? path}
                      </h2>
                    </div>
                    {node ? (
                      <code className="mt-1 block truncate text-muted-foreground">
                        {path}
                      </code>
                    ) : (
                      id && (
                        <p className="mt-1 mb-0 text-xs text-muted-foreground">
                          {t("Not in the graph until these errors are fixed.")}
                        </p>
                      )
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <IssueCounts
                      errors={errors}
                      warnings={warnings}
                      className="mr-2.5"
                    />
                    {node && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/graph" search={{ focus: node.id }}>
                          {t("Graph")}
                        </Link>
                      </Button>
                    )}
                    {id ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to="/nodes/$id"
                          params={{ id }}
                          // Open at the first problem when its line is meaningful here.
                          search={openAt(
                            issues.find((i) => i.line !== undefined)?.line,
                          )}
                        >
                          {t("Fix in source")}
                        </Link>
                      </Button>
                    ) : (
                      <span className="max-w-72 text-xs text-muted-foreground">
                        {t(unopenedFileHint[service.store.kind])}
                      </span>
                    )}
                  </div>
                </div>
                <IssueList
                  issues={issues}
                  className="mt-3.5"
                  onLine={
                    id && service.store.kind !== "remote"
                      ? (line) =>
                          void navigate({
                            to: "/nodes/$id",
                            params: { id },
                            search: openAt(line),
                          })
                      : undefined
                  }
                />
              </section>
            );
          })}
          <IssueCodeGuide
            codes={issues.map((issue) => issue.code)}
            className="mt-6"
          />
        </div>
      )}
    </Page>
  );
}
