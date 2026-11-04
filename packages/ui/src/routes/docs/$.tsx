import { useWorkspace } from "../../workspace/context.js";
import { usePreferences } from "../../components/preferences.js";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
} from "lucide-react";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { docsQuery, kbQuery, pageQuery } from "../../api.js";
import {
  ErrorMessage,
  sectionHeading,
} from "../../components/ui/primitives.js";
import { Button } from "../../components/ui/button.js";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.js";
import {
  headingId,
  Markdown,
  stripFrontmatter,
} from "../../components/markdown.js";
import { cn, downloadBlob, label } from "../../lib/utils.js";

export const Route = createFileRoute("/docs/$")({
  validateSearch: (s: Record<string, unknown>) => ({
    layout: s.layout === "graph" ? "graph" : "site",
  }),
  component: Docs,
});

const pagerLink =
  "max-w-[50%] flex-1 rounded-lg border px-4 py-3 font-medium text-foreground hover:border-primary hover:text-primary-ink";
const pagerLabel =
  "mb-0.5 flex items-center gap-0.5 text-[11px] font-normal text-muted-foreground";

interface Folder {
  name: string;
  index?: string;
  pages: string[];
  folders: Map<string, Folder>;
}

/** Group flat page paths into folders; pages keep server order, folders sort by name. */
function buildTree(paths: string[]): Folder {
  const root: Folder = { name: "", pages: [], folders: new Map() };
  for (const path of paths) {
    const parts = path.split("/");
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      if (!folder.folders.has(part))
        folder.folders.set(part, { name: part, pages: [], folders: new Map() });
      folder = folder.folders.get(part)!;
    }
    if (parts.at(-1) === "index.md") folder.index = path;
    else folder.pages.push(path);
  }
  return root;
}

const sortedFolders = (folder: Folder) =>
  [...folder.folders.values()].sort((a, b) => a.name.localeCompare(b.name));

/** Pages in the same order the sidebar shows them, for previous/next links. */
const flatten = (folder: Folder): string[] => [
  ...(folder.index ? [folder.index] : []),
  ...folder.pages,
  ...sortedFolders(folder).flatMap(flatten),
];

/** Index pages take their folder's name; the root index has none (it is the overview). */
const pageName = (path: string) => {
  const parts = path.replace(/(?:^|\/)index\.md$/, "").split("/");
  const name = parts.at(-1)?.replace(/\.md$/, "");
  return name ? label(name) : undefined;
};

/** h2/h3 headings outside code fences, for the "On this page" list. */
function outline(content: string) {
  return [
    ...content
      .replace(/```[\s\S]*?```/g, "")
      .matchAll(/^(#{2,3})\s+(.+?)\s*#*$/gm),
  ].map(([, hashes, raw]) => {
    const text = raw
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[`*_]/g, "");
    return { depth: hashes.length, text, id: headingId(text) };
  });
}

function Docs() {
  const { service } = useWorkspace();
  const { t, label, language } = usePreferences();

  const { _splat } = Route.useParams();
  const { layout } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: paths, error } = useQuery(docsQuery(service, layout, language));
  const tree = buildTree(paths ?? []);
  const order = flatten(tree);
  const path = _splat || order[0] || "";
  const page = useQuery(pageQuery(service, layout, path, language));
  const { data: kb } = useQuery(kbQuery(service));
  // Under 780px the page list folds away so the article keeps the full width.
  // It stays open only for the page it was opened on, so following a link closes it.
  const [openedOn, setOpenedOn] = useState<string>();
  const pagesOpen = openedOn === `${layout}:${path}`;
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const downloadZip = useMutation({
    mutationFn: async () =>
      downloadBlob(
        new Blob([new Uint8Array(service.exportDocsZip(layout, language))], {
          type: "application/zip",
        }),
        `${service.store.name}-docs-${layout}.zip`,
      ),
  });
  const content = page.data ? stripFrontmatter(page.data.content) : "";
  const toc = outline(content);
  const at = order.indexOf(path);
  const prev = at > 0 ? order[at - 1] : undefined;
  const next = at >= 0 ? order[at + 1] : undefined;
  const nameOf = (p: string) => pageName(p) ?? t("Overview");
  const pageLink = (p: string, text = nameOf(p)) => (
    <Link
      to="/docs/$"
      params={{ _splat: p }}
      search={{ layout }}
      className={cn(
        "block rounded-md px-2 py-1.25 wrap-anywhere",
        p === path
          ? "bg-accent font-medium text-primary-ink"
          : "text-muted-foreground hover:bg-background hover:text-foreground",
      )}
    >
      {text}
    </Link>
  );

  // A folder's heading is the link to its index page, so the tree does not
  // repeat "Overview" under every folder. Nested folders stay folded unless
  // they hold the current page or the reader opened them.
  const folderOpen = (prefix: string) =>
    path.startsWith(prefix) || openFolders.includes(prefix);
  const renderFolder = (folder: Folder, depth: number, prefix = "") => (
    <ul className={depth >= 2 ? "ml-2.5 border-l pl-2" : undefined}>
      {depth === 0 && folder.index && (
        <li>{pageLink(folder.index, t("Overview"))}</li>
      )}
      {folder.pages.map((p) => (
        <li key={p}>{pageLink(p)}</li>
      ))}
      {sortedFolders(folder).map((child) => {
        const childPrefix = `${prefix}${child.name}/`;
        const name = label(child.name);
        if (depth === 0)
          return (
            <li key={child.name} className="mt-4.5">
              {child.index ? (
                <Link
                  to="/docs/$"
                  params={{ _splat: child.index }}
                  search={{ layout }}
                  aria-current={child.index === path ? "page" : undefined}
                  className={cn(
                    sectionHeading,
                    "block rounded-md px-2 pt-1 pb-1.5 hover:text-primary-ink aria-[current=page]:text-primary-ink",
                  )}
                >
                  {name}
                </Link>
              ) : (
                <div className={cn(sectionHeading, "px-2 pb-1.5")}>{name}</div>
              )}
              {renderFolder(child, depth + 1, childPrefix)}
            </li>
          );
        const open = folderOpen(childPrefix);
        return (
          <li key={child.name}>
            <div className="flex items-center">
              <button
                type="button"
                aria-expanded={open}
                aria-label={t(open ? "Collapse {name}" : "Expand {name}", {
                  name,
                })}
                onClick={() =>
                  setOpenFolders((old) =>
                    open
                      ? old.filter((p) => p !== childPrefix)
                      : [...old, childPrefix],
                  )
                }
                className="-ml-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "size-3.5 transition-transform",
                    open && "rotate-90",
                  )}
                />
              </button>
              <div className="min-w-0 flex-1">
                {child.index ? (
                  pageLink(child.index, name)
                ) : (
                  <span className="block px-2 py-1.25 text-muted-foreground">
                    {name}
                  </span>
                )}
              </div>
            </div>
            {open && renderFolder(child, depth + 1, childPrefix)}
          </li>
        );
      })}
    </ul>
  );

  const crumbs = path.split("/").slice(0, -1);
  const download = () =>
    downloadBlob(
      new Blob([page.data!.content], { type: "text/markdown" }),
      path.replaceAll("/", "-"),
    );
  return (
    <div className="flex h-full min-h-125 bg-card max-[780px]:min-h-full max-[780px]:flex-col">
      <aside
        className={cn(
          "flex w-65 shrink-0 flex-col overflow-auto border-r text-sm max-[780px]:w-full max-[780px]:border-r-0 max-[780px]:border-b",
          pagesOpen && "max-[780px]:max-h-[60%]",
        )}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-2 border-b bg-card px-4 pt-4.5 pb-3.5 max-[780px]:py-2.5">
          <span className="text-sm font-semibold">{t("Documentation")}</span>
          <Tabs
            value={layout}
            onValueChange={(value) =>
              void navigate({
                params: { _splat: "" },
                search: { layout: value as typeof layout },
              })
            }
          >
            <TabsList aria-label={t("Docs layout")}>
              {["site", "graph"].map((value) => (
                <TabsTrigger key={value} value={value}>
                  {label(value)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <button
          type="button"
          aria-expanded={pagesOpen}
          aria-controls="docs-pages"
          onClick={() =>
            setOpenedOn(pagesOpen ? undefined : `${layout}:${path}`)
          }
          className="flex min-h-11 items-center gap-2 px-4 text-left min-[781px]:hidden"
        >
          <span className="text-muted-foreground">{t("Pages")}</span>
          <span className="min-w-0 flex-1 truncate font-medium">
            {nameOf(path)}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              pagesOpen && "rotate-180",
            )}
          />
        </button>
        <nav
          id="docs-pages"
          aria-label={t("Documentation")}
          className={cn(
            "flex-1 px-2.5 pt-3 pb-7 max-[780px]:border-t",
            !pagesOpen && "max-[780px]:hidden",
          )}
        >
          {renderFolder(tree, 0)}
        </nav>
        <footer
          className={cn(
            "sticky bottom-0 shrink-0 border-t bg-card px-4 py-3",
            !pagesOpen && "max-[780px]:hidden",
          )}
        >
          <Button
            variant="link"
            size="sm"
            className="px-0"
            onClick={() => downloadZip.mutate()}
            disabled={!paths?.length || downloadZip.isPending}
          >
            <Download /> {t("Download docs (.zip)")}
          </Button>
          <ErrorMessage error={downloadZip.error} />
        </footer>
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <div className="flex justify-center gap-12 px-12 pt-10 pb-16 max-[780px]:px-5 max-[780px]:pt-6 max-[780px]:pb-12">
          <article className="min-w-0 max-w-190 flex-1">
            {!!kb?.status.errors && (
              <div
                role="status"
                className="mb-6 flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-xs leading-5 text-foreground"
              >
                <CircleAlert
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                />
                <span className="min-w-0">
                  <span className="error font-medium text-(--type-ink)">
                    {t(
                      kb.status.errors === 1
                        ? "1 lint error"
                        : "{count} lint errors",
                      { count: kb.status.errors },
                    )}
                  </span>
                  {" · "}
                  {t(
                    "Preview is available, but simp-docs would refuse to export.",
                  )}{" "}
                  <Link to="/issues" search={{ severity: "error" }}>
                    {t("Fix in Issues")}
                  </Link>
                </span>
              </div>
            )}
            {page.data && (
              <div className="mb-4 flex items-center justify-between gap-3">
                <nav
                  className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
                  aria-label={t("Breadcrumb")}
                >
                  {crumbs.map((name, i) => {
                    const index = [...crumbs.slice(0, i + 1), "index.md"].join(
                      "/",
                    );
                    return (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1"
                      >
                        {paths?.includes(index) && index !== path ? (
                          <Link
                            to="/docs/$"
                            params={{ _splat: index }}
                            search={{ layout }}
                            className="hover:text-primary-ink"
                          >
                            {label(name)}
                          </Link>
                        ) : (
                          label(name)
                        )}
                        <ChevronRight size={12} />
                      </span>
                    );
                  })}
                </nav>
                <Button variant="outline" size="sm" onClick={download}>
                  <Download /> Markdown
                </Button>
              </div>
            )}
            <ErrorMessage error={error ?? page.error} />
            {page.isPending && path && (
              <p className="text-muted-foreground">{t("Rendering page…")}</p>
            )}
            {page.data && (
              <Markdown
                content={content}
                path={page.data.path}
                layout={layout}
                className="text-[15px]"
              />
            )}
            {paths?.length === 0 && (
              <div className="px-6.25 py-17.5 text-center text-muted-foreground">
                <h2>{t("No documentation pages")}</h2>
                <p>{t("Add nodes, or fix the files listed in Issues.")}</p>
              </div>
            )}
            {(prev || next) && (
              <div className="mt-14 flex justify-between gap-4 border-t pt-6">
                {prev ? (
                  <Link
                    to="/docs/$"
                    params={{ _splat: prev }}
                    search={{ layout }}
                    className={pagerLink}
                  >
                    <small className={pagerLabel}>
                      <ChevronLeft size={12} /> {t("Previous")}
                    </small>
                    {nameOf(prev)}
                  </Link>
                ) : (
                  <span />
                )}
                {next && (
                  <Link
                    to="/docs/$"
                    params={{ _splat: next }}
                    search={{ layout }}
                    className={cn(pagerLink, "text-right")}
                  >
                    <small className={cn(pagerLabel, "justify-end")}>
                      {t("Next")}
                      <ChevronRight size={12} />
                    </small>
                    {nameOf(next)}
                  </Link>
                )}
              </div>
            )}
          </article>
          {toc.length > 1 && (
            <aside className="sticky top-0 flex w-50 shrink-0 flex-col gap-0.5 self-start text-xs max-[1100px]:hidden">
              <div className={cn(sectionHeading, "mb-2")}>
                {t("On this page")}
              </div>
              {toc.map((h) => (
                <a
                  key={h.id}
                  href={"#" + h.id}
                  className="py-0.75 text-muted-foreground hover:text-primary-ink"
                  style={{ paddingLeft: (h.depth - 2) * 12 }}
                >
                  {h.text}
                </a>
              ))}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
