import { useWorkspace } from "../workspace/context.js";
import { usePreferences } from "../components/preferences.js";
import { useEffect, useState } from "react";
import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../components/ui/command.js";
import { downloadBlob, groupByType } from "../lib/utils.js";
import { Kbd } from "../components/ui/kbd.js";
import {
  BookOpen,
  FlaskConical,
  GitBranch,
  List,
  TriangleAlert,
  Search,
  RefreshCw,
  Moon,
  Sun,
  ChevronsUpDown,
  BookOpenCheck,
  X,
  Sparkles,
} from "lucide-react";
import { kbQuery, searchQuery } from "../api.js";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "../components/ui/dropdown-menu.js";
import {
  Button,
  Dialog,
  ErrorMessage,
  Page,
} from "../components/ui/primitives.js";
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: Shell,
    errorComponent: WorkspaceError,
  },
);

function WorkspaceError({ error }: { error: unknown }) {
  const { t } = usePreferences();
  return (
    <Page>
      <h1>{t("Unable to load workspace")}</h1>
      <ErrorMessage error={error} />
      <Link to="/">{t("Try again")}</Link>
    </Page>
  );
}

function Shell() {
  const {
    service,
    close,
    openAnother,
    reload: reloadWorkspace,
  } = useWorkspace();
  const { t, label, language, theme, setLanguage, setTheme } = usePreferences();

  const { data: kb, error } = useQuery(kbQuery(service));
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const results = useQuery(searchQuery(service, q));
  const navigate = useNavigate();
  const issueCount = (kb?.status.errors ?? 0) + (kb?.status.warnings ?? 0);
  const issueSummary = `${kb?.status.errors ?? 0} ${t("errors")} · ${kb?.status.warnings ?? 0} ${t("warnings")}`;
  const reload = useMutation({
    mutationFn: () => reloadWorkspace(),
    // A failed reload also changes the stale flag, so refetch either way.
    onSettled: () => client.invalidateQueries(),
  });
  const download = useMutation({
    mutationFn: async () =>
      downloadBlob(
        new Blob([new Uint8Array(await service.exportZip())], {
          type: "application/zip",
        }),
        `${service.store.name}.zip`,
      ),
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-17 shrink-0 items-center gap-6.25 border-b bg-card px-6.25 max-[1100px]:gap-3.75 max-[780px]:h-14.5 max-[780px]:gap-2.5 max-[780px]:px-3.25">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/graph"
            className="flex items-center gap-2.25 text-[23px] font-bold tracking-[-1px] text-foreground max-[780px]:text-xl"
          >
            <img
              src={`${import.meta.env.BASE_URL}logo.svg`}
              alt=""
              width={26}
              height={26}
            />
            <span>
              <span className="text-primary">simp</span>link
            </span>
          </Link>
          <span aria-hidden className="text-lg text-border">
            |
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t("Knowledge base actions")}
                title={service.store.name}
                className="min-w-0 text-muted-foreground"
              >
                <span className="max-w-40 truncate max-[780px]:max-w-24">
                  {service.store.name}
                </span>
                <ChevronsUpDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuLabel className="truncate">
                {service.store.name}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={openAnother}>
                <BookOpenCheck />
                {t("Open another knowledge base")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={close}>
                <X />
                {t("Close knowledge base")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          variant="outline"
          className="w-72 justify-start bg-background text-muted-foreground max-[1100px]:w-56 max-[900px]:w-auto"
          aria-label={t("Search nodes…")}
          onClick={() => setOpen(true)}
        >
          <Search size={15} />
          <span className="max-[900px]:hidden">{t("Search nodes…")}</span>
          <Kbd className="ml-auto max-[900px]:hidden">⌘K</Kbd>
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("Reload")}
            title={t("Reload")}
            disabled={reload.isPending}
            onClick={() => reload.mutate()}
          >
            <RefreshCw className={reload.isPending ? "animate-spin" : ""} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t(
              theme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme",
            )}
            title={t(
              theme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme",
            )}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Moon /> : <Sun />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("Language")}
                title={t("Language")}
              >
                {language}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>{t("Language")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={language}
                onValueChange={(value) =>
                  setLanguage(value === "vi" ? "vi" : "en")
                }
              >
                <DropdownMenuRadioItem value="en">
                  <span className="text-muted-foreground">en</span>
                  <span lang="en">English</span>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="vi">
                  <span className="text-muted-foreground">vi</span>
                  <span lang="vi">Tiếng Việt</span>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {service.store.kind === "memory" && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border-b bg-warning/10 px-6 py-2 text-sm"
        >
          <span>
            Changes saved in memory — download to keep them. Dot-files and
            dot-folders are excluded.
          </span>
          <Button
            variant="outline"
            onClick={() => download.mutate()}
            disabled={download.isPending}
          >
            Download KB (.zip)
          </Button>
        </div>
      )}
      {kb?.stale && (
        <p role="alert">
          The last rebuild failed. Reload to refresh this workspace.
        </p>
      )}
      <ErrorMessage error={download.error} />
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-20 shrink-0 flex-col gap-2.5 border-r bg-card px-2 py-6 max-[780px]:w-14.5 max-[780px]:px-1 max-[780px]:py-3.75">
          {[
            { to: "/graph", label: "Graph", Icon: GitBranch },
            { to: "/nodes", label: "Nodes", Icon: List },
            { to: "/issues", label: "Issues", Icon: TriangleAlert },
            { to: "/docs/$", label: "Docs", Icon: BookOpen },
            { to: "/playground", label: "Playground", Icon: FlaskConical },
            { to: "/skills", label: "Skills", Icon: Sparkles },
          ].map(({ to, label, Icon }) => (
            <Link
              key={label}
              to={to}
              params={to === "/docs/$" ? { _splat: "" } : undefined}
              className="flex flex-col items-center gap-1.5 rounded-[7px] px-1 py-3 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-primary data-[status=active]:bg-accent data-[status=active]:text-primary max-[780px]:text-[9px]"
            >
              <span className="relative">
                <Icon size={19} className="max-[780px]:w-4.25" />
                {to === "/issues" && issueCount > 0 && (
                  <span
                    title={issueSummary}
                    aria-label={issueSummary}
                    className={`absolute -top-1.5 left-3 min-w-4 rounded-full px-1 text-center text-[9px] leading-4 font-semibold text-background ${kb?.status.errors ? "bg-destructive" : "bg-warning"}`}
                  >
                    {issueCount > 99 ? "99+" : issueCount}
                  </span>
                )}
              </span>
              <span>{t(label)}</span>
            </Link>
          ))}
          <div className="mt-auto text-center text-[8px] leading-loose tracking-[1px] text-muted-foreground max-[780px]:hidden">
            {t("LOCAL KB")}
            <span className="block text-[10px] tracking-normal">
              {kb?.status.nodes ?? 0} {t("nodes")}
            </span>
          </div>
        </nav>
        <div className="relative min-w-0 flex-1 overflow-auto">
          <ErrorMessage error={error ?? reload.error} />
          <Outlet />
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen} title={t("Search knowledge")}>
        <Command shouldFilter={false}>
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder={t("Search titles and aliases…")}
            autoFocus
          />
          <CommandList>
            <CommandEmpty>
              {results.isFetching
                ? t("Searching…")
                : q
                  ? t("No nodes found.")
                  : t("Type to search your knowledge base.")}
            </CommandEmpty>
            {groupByType(results.data?.hits ?? [], (hit) => hit.type).map(
              ([type, hits]) => (
                <CommandGroup key={type} heading={label(type)}>
                  {hits.map((hit) => (
                    <CommandItem
                      key={hit.id}
                      value={hit.id}
                      onSelect={() => {
                        setOpen(false);
                        void navigate({
                          to: "/graph",
                          search: { focus: hit.id },
                        });
                      }}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{hit.title}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {hit.id}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ),
            )}
          </CommandList>
        </Command>
        <ErrorMessage error={results.error} />
      </Dialog>
    </div>
  );
}
