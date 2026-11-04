import type { Issue } from "@sontx/simplink-core";
import { issueCodeMeaning } from "../lib/issue-codes.js";
import { cn } from "../lib/utils.js";
import { usePreferences } from "./preferences.js";
import { Badge } from "./ui/primitives.js";

/**
 * Issues for one file: severity-coloured code, the message, then its line.
 * With `onLine`, the line becomes a button that jumps to it; `activeIndex`
 * marks the issue the author is working on (-1 for none yet).
 */
export function IssueList({
  issues,
  className,
  onLine,
  activeIndex,
}: {
  issues: readonly Issue[];
  className?: string;
  onLine?: (line: number, index: number) => void;
  activeIndex?: number;
}) {
  const { t, language } = usePreferences();
  return (
    <ul
      className={cn(
        "m-0 flex list-none flex-col p-0",
        // Tracked rows carry their own padding for the active fill.
        activeIndex === undefined ? "gap-2" : "gap-0.5",
        className,
      )}
    >
      {issues.map((issue, index) => (
        <li
          key={index}
          aria-current={index === activeIndex || undefined}
          className={cn(
            "flex items-start gap-2.5 rounded-md text-sm",
            activeIndex !== undefined &&
              "-mx-2 px-2 py-1 aria-current:bg-muted",
          )}
        >
          <Badge
            type={issue.severity}
            title={issueCodeMeaning(issue.code, language)}
          >
            {issue.code}
          </Badge>
          <span className="min-w-0 leading-5 wrap-anywhere">
            {issue.message}
            {issue.line !== undefined &&
              (onLine ? (
                <button
                  type="button"
                  onClick={() => onLine(issue.line!, index)}
                  className="ml-2 rounded-sm text-xs text-primary tabular-nums underline-offset-3 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {t("Line {line}", { line: issue.line })}
                </button>
              ) : (
                <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                  {t("Line {line}", { line: issue.line })}
                </span>
              ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A disclosure explaining each code shown, so meanings are not hover-only. */
export function IssueCodeGuide({
  codes,
  className,
}: {
  codes: readonly string[];
  className?: string;
}) {
  const { t, language } = usePreferences();
  const explained = [...new Set(codes)].sort().flatMap((code) => {
    const meaning = issueCodeMeaning(code, language);
    return meaning ? [[code, meaning] as const] : [];
  });
  if (!explained.length) return null;
  return (
    <details className={cn("group text-sm", className)}>
      <summary className="w-fit cursor-pointer rounded-sm text-muted-foreground select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        {t("What these codes mean")}
      </summary>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
        {explained.map(([code, meaning]) => (
          <div key={code} className="contents">
            <dt>
              <Badge type={code.startsWith("E") ? "error" : "warning"}>
                {code}
              </Badge>
            </dt>
            <dd className="m-0 leading-5">{meaning}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** "2 errors · 1 warning", each count in its severity colour. */
export function IssueCounts({
  errors,
  warnings,
  className,
}: {
  errors: number;
  warnings: number;
  className?: string;
}) {
  const { t } = usePreferences();
  return (
    <span className={cn("text-xs tabular-nums", className)}>
      {errors > 0 && (
        <span className="text-destructive">
          {errors === 1 ? t("1 error") : t("{count} errors", { count: errors })}
        </span>
      )}
      {errors > 0 && warnings > 0 && (
        <span className="text-muted-foreground"> · </span>
      )}
      {warnings > 0 && (
        <span className="text-warning">
          {warnings === 1
            ? t("1 warning")
            : t("{count} warnings", { count: warnings })}
        </span>
      )}
    </span>
  );
}
