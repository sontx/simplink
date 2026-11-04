import { useEffect, useState } from "react";
import { parseDoc } from "@sontx/simplink-core/browser";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { pageQuery } from "../api.js";
import { useWorkspace } from "../workspace/context.js";
import { usePreferences } from "./preferences.js";
import { Markdown, stripFrontmatter } from "./markdown.js";
import { PlanBody } from "./inspector.js";
import { ErrorMessage } from "./ui/primitives.js";
import { cn } from "../lib/utils.js";

type View = "docs" | "plan";

/**
 * What the file produces, beside its source: the reader page, or for a goal or
 * procedure, the agent plan. While the author types, Docs renders the draft
 * itself; the plan needs the rebuilt graph, so it follows saves and says so.
 */
export function SourcePreview({
  id,
  type,
  docPath,
  inGraph,
  draft,
  path,
  className,
}: {
  id: string;
  type: string;
  docPath: string;
  inGraph: boolean;
  /** The unsaved source, when it differs from the file. */
  draft?: string;
  path: string;
  className?: string;
}) {
  const { service } = useWorkspace();
  const { t } = usePreferences();
  const plannable = type === "goal" || type === "procedure";
  const [view, setView] = useState<View>(plannable ? "plan" : "docs");
  // Settle typing before re-rendering Markdown.
  const [settled, setSettled] = useState(draft);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(draft), 300);
    return () => clearTimeout(timer);
  }, [draft]);
  const dirty = draft !== undefined;
  const live =
    dirty && settled !== undefined ? parseDoc(path, settled) : undefined;
  const page = useQuery({
    ...pageQuery(service, "site", docPath),
    enabled: inGraph && view === "docs",
  });
  const views: { value: View; label: string }[] = [
    ...(plannable ? [{ value: "plan" as const, label: t("Agent plan") }] : []),
    { value: "docs", label: t("Docs") },
  ];
  return (
    <section
      aria-label={t("Preview")}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-border px-3.5 py-2">
        <div role="group" aria-label={t("Preview")} className="flex gap-1">
          {views.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={view === item.value}
              onClick={() => setView(item.value)}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:bg-muted aria-pressed:text-foreground"
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {!dirty
            ? t("From the saved file")
            : view === "plan"
              ? t("Save to update the plan")
              : live?.parseError
                ? t("Draft doesn't parse · showing the saved file")
                : t("Live draft · links resolve on save")}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4.5">
        {!inGraph ? (
          <p className="text-sm text-muted-foreground">
            {t("The preview returns once the frontmatter parses.")}
          </p>
        ) : view === "plan" ? (
          <PlanBody id={id} />
        ) : live && !live.parseError ? (
          <Markdown
            content={[
              typeof live.data.title === "string" && `# ${live.data.title}`,
              typeof live.data.summary === "string" && live.data.summary,
              live.body,
            ]
              .filter(Boolean)
              .join("\n\n")}
            className="markdown-compact"
          />
        ) : (
          <>
            <ErrorMessage error={page.error} />
            {page.isPending && (
              <p role="status" className="text-sm text-muted-foreground">
                {t("Loading documentation…")}
              </p>
            )}
            {page.data && (
              <>
                <Link
                  to="/docs/$"
                  params={{ _splat: docPath }}
                  search={{ layout: "site" }}
                  className="mb-3 block text-xs text-muted-foreground hover:text-foreground"
                >
                  <code className="wrap-anywhere">{docPath}</code>
                </Link>
                <Markdown
                  content={stripFrontmatter(page.data.content)}
                  path={docPath}
                  layout="site"
                  className="markdown-compact"
                />
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
