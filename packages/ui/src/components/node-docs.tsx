import { useWorkspace } from "../workspace/context.js";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { pageQuery } from "../api.js";
import { Markdown, stripFrontmatter } from "./markdown.js";
import { usePreferences } from "./preferences.js";
import { Button, ErrorMessage } from "./ui/primitives.js";

export function NodeDocs({
  docPath,
  nodePath,
}: {
  docPath: string;
  nodePath: string;
}) {
  const { service } = useWorkspace();
  const { t, language } = usePreferences();
  const page = useQuery(pageQuery(service, "site", docPath, language));
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="min-w-0">
          <div className="mb-1 text-xs font-medium">
            {t("Published documentation")}
          </div>
          <code className="text-xs text-muted-foreground wrap-anywhere">
            {docPath}
          </code>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Link
            to="/docs/$"
            params={{ _splat: nodePath }}
            search={{ layout: "graph" }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t("Graph docs")}
          </Link>
          <Button size="sm" asChild>
            <Link
              to="/docs/$"
              params={{ _splat: docPath }}
              search={{ layout: "site" }}
            >
              {t("Open docs")}
            </Link>
          </Button>
        </div>
      </div>
      <div className="mx-auto max-w-3xl py-8">
        <ErrorMessage error={page.error} />
        {page.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("Loading documentation…")}
          </p>
        )}
        {page.data && (
          <Markdown
            content={stripFrontmatter(page.data.content)}
            path={docPath}
            layout="site"
          />
        )}
      </div>
    </div>
  );
}
