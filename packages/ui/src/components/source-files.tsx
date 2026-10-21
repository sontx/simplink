import React from "react";
import { FileText } from "lucide-react";
import { usePreferences } from "./preferences.js";

export function SourceFiles({ sources }: { sources: string[] }) {
  const { t } = usePreferences();
  if (!sources.length) return <span>{t("None")}</span>;
  return (
    <ul className="m-0 space-y-2 list-none p-0">
      {sources.map((source, index) => (
        <li key={index} className="flex items-start gap-2">
          <FileText aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {/^(https?):\/\//i.test(source) ? (
            <a
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 font-mono text-primary hover:underline"
            >
              {source}
            </a>
          ) : (
            <code className="min-w-0">{source}</code>
          )}
        </li>
      ))}
    </ul>
  );
}
