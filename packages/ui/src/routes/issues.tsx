import { useWorkspace } from "../workspace/context.js";
import { usePreferences } from "../components/preferences.js";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { kbQuery } from "../api.js";
import { Badge, Button, Eyebrow, Page } from "../components/ui/primitives.js";
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

// Files that never became nodes have no editor here; where to fix them depends on the store.
const unopenedFileHint = {
  directory:
    "This file can't be opened here. Fix it in your editor, then Reload.",
  memory:
    "This file can't be opened here. Download the KB to keep your edits, fix the file in your editor, then open the folder again.",
  remote: "Fix this file in the simp node's own folder.",
} as const;

function Issues() {
  const { service } = useWorkspace();
  const { t, label, enumDescription } = usePreferences();

  const { data: kb } = useQuery(kbQuery(service));
  const { severity } = Route.useSearch();
  const navigate = Route.useNavigate();
  const issues =
    kb?.issues.filter((i) => !severity || i.severity === severity) ?? [];
  const files = groupIssuesByFile(issues, kb?.nodes ?? []);
  const errors = files.reduce((sum, file) => sum + file.errors, 0);
  const warnings = files.reduce((sum, file) => sum + file.warnings, 0);
  // The fix loop starts at the first issue the Source tab can open. Indexes
  // must match its unfiltered list, so the severity filter only picks which issue.
  const first = issueQueue(
    groupIssuesByFile(kb?.issues ?? [], kb?.nodes ?? []),
  ).find((item) => !severity || item.issue.severity === severity);
  return (
    <Page>
      <div className="mb-7 flex items-end justify-between gap-6.25 max-[780px]:items-start max-[780px]:gap-2.5">
        <div>
          <Eyebrow>{t("VALIDATION")}</Eyebrow>
          <h1 className="mt-1.25 mb-1.5 max-[780px]:text-[22px]">
            {t("Issues")}
          </h1>
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
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.25">
          <Select
            value={severity || "all"}
            onValueChange={(value) =>
              void navigate({
                search: { severity: value === "all" ? "" : value },
              })
            }
          >
            <SelectTrigger
              aria-label={t("Severity")}
              title={enumDescription(severity, "issue")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t("All severities")}</SelectItem>
                <SelectItem
                  value="error"
                  title={enumDescription("error", "issue")}
                >
                  {t("Errors")}
                </SelectItem>
                <SelectItem
                  value="warning"
                  title={enumDescription("warning", "issue")}
                >
                  {t("Warnings")}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {first?.file.node && !service.store.readOnly && (
            <Button asChild>
              <Link
                to="/nodes/$id"
                params={{ id: first.file.node.id }}
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
      {!files.length && (
        <div className="px-6.25 py-17.5 text-center text-muted-foreground">
          <h2>{t("All clear")}</h2>
          <p className="text-muted-foreground">
            {t("No issues match this view.")}
          </p>
        </div>
      )}
      {files.length > 0 && (
        <div className="border-t border-border">
          {files.map(({ path, node, issues, errors, warnings }) => (
            <section
              key={path}
              aria-label={node?.title ?? path}
              className="border-b border-border py-5"
            >
              <div className="flex items-start justify-between gap-5 max-[780px]:flex-col max-[780px]:items-stretch max-[780px]:gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-start gap-2">
                    {node && <Badge type={node.type}>{label(node.type)}</Badge>}
                    <h2 className="m-0 min-w-0 text-sm leading-5 font-semibold wrap-anywhere">
                      {node?.title ?? path}
                    </h2>
                  </div>
                  {node && (
                    <code className="mt-1 block truncate text-muted-foreground">
                      {path}
                    </code>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <IssueCounts
                    errors={errors}
                    warnings={warnings}
                    className="mr-2.5"
                  />
                  {node ? (
                    <>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/graph" search={{ focus: node.id }}>
                          {t("Graph")}
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to="/nodes/$id"
                          params={{ id: node.id }}
                          search={{
                            tab: "source",
                            // Open at the first problem when its line is meaningful here.
                            line:
                              service.store.kind !== "remote"
                                ? issues.find((i) => i.line !== undefined)?.line
                                : undefined,
                          }}
                        >
                          {t("Fix in source")}
                        </Link>
                      </Button>
                    </>
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
                  // A remote node's lines refer to its original files, not the rebuilt source.
                  node && service.store.kind !== "remote"
                    ? (line) =>
                        void navigate({
                          to: "/nodes/$id",
                          params: { id: node.id },
                          search: { tab: "source", line },
                        })
                    : undefined
                }
              />
            </section>
          ))}
          <IssueCodeGuide
            codes={issues.map((issue) => issue.code)}
            className="mt-6"
          />
        </div>
      )}
    </Page>
  );
}
