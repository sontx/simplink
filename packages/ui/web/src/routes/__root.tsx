import { label } from "../lib/utils.js";
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
  CommandItem,
} from "../components/ui/command.js";
import { Kbd } from "../components/ui/kbd.js";
import {
  BookOpen,
  GitBranch,
  List,
  TriangleAlert,
  Search,
  RefreshCw,
  Network,
} from "lucide-react";
import { api, kbQuery, searchQuery } from "../api.js";
import {
  Badge,
  Button,
  Dialog,
  ErrorMessage,
  Page,
} from "../components/ui/primitives.js";
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: Shell,
    errorComponent: ({ error }) => (
      <Page>
        <h1>Unable to load workspace</h1>
        <ErrorMessage error={error} />
        <a href="/">Try again</a>
      </Page>
    ),
  },
);

function Shell() {
  const { data: kb, error } = useQuery(kbQuery);
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const results = useQuery(searchQuery(q));
  const navigate = useNavigate();
  const reload = useMutation({
    mutationFn: () => api("/reload", { method: "POST", body: "{}" }),
    onSuccess: () => client.invalidateQueries(),
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
        <Link
          to="/graph"
          className="flex items-center gap-2.25 text-[23px] font-bold tracking-[-1px] text-[#382d43] max-[780px]:text-xl"
        >
          <Network size={23} className="text-primary" />
          simplink
          <span className="ml-1.5 border-l pl-3.5 text-[10px] font-normal tracking-[0.2px] text-[#a49aaa] max-[1100px]:hidden">
            workspace
          </span>
        </Link>
        <Button
          variant="outline"
          className="ml-5 w-72 justify-start bg-background text-muted-foreground max-[1100px]:ml-0 max-[1100px]:w-56 max-[780px]:w-auto"
          onClick={() => setOpen(true)}
        >
          <Search size={15} />
          <span className="max-[780px]:hidden">Search nodes…</span>
          <Kbd className="ml-auto max-[780px]:hidden">⌘K</Kbd>
        </Button>
        <div className="ml-auto flex gap-2.25 max-[1100px]:gap-0.75">
          <Badge type={kb?.status.errors ? "error" : "success"}>
            ● {kb?.status.errors ?? 0} errors
          </Badge>
          <Badge type="warning">△ {kb?.status.warnings ?? 0} warnings</Badge>
        </div>
        <Button
          variant="outline"
          disabled={reload.isPending}
          onClick={() => reload.mutate()}
        >
          <RefreshCw
            size={14}
            className={reload.isPending ? "animate-spin" : ""}
          />
          <span className="max-[780px]:hidden">Reload</span>
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-20 shrink-0 flex-col gap-2.5 border-r bg-card px-2 py-6 max-[780px]:w-14.5 max-[780px]:px-1 max-[780px]:py-3.75">
          {[
            { to: "/graph", label: "Graph", Icon: GitBranch },
            { to: "/nodes", label: "Nodes", Icon: List },
            { to: "/issues", label: "Issues", Icon: TriangleAlert },
            { to: "/docs/$", label: "Docs", Icon: BookOpen },
          ].map(({ to, label, Icon }) => (
            <Link
              key={label}
              to={to}
              params={to === "/docs/$" ? { _splat: "" } : undefined}
              className="flex flex-col items-center gap-1.5 rounded-[7px] px-1 py-3 text-[10px] text-[#a199ab] transition-colors hover:bg-accent hover:text-primary data-[status=active]:bg-accent data-[status=active]:text-primary max-[780px]:text-[9px]"
            >
              <Icon size={19} className="max-[780px]:w-4.25" />
              <span>{label}</span>
            </Link>
          ))}
          <div className="mt-auto text-center text-[8px] leading-loose tracking-[1px] text-[#aaa1b5] max-[780px]:hidden">
            LOCAL KB
            <span className="block text-[10px] tracking-normal">
              {kb?.status.nodes ?? 0} nodes
            </span>
          </div>
        </nav>
        <div className="relative min-w-0 flex-1 overflow-auto">
          <ErrorMessage error={error ?? reload.error} />
          <Outlet />
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen} title="Search knowledge">
        <Command shouldFilter={false}>
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder="Search titles and aliases…"
            autoFocus
          />
          <CommandList>
            <CommandEmpty>
              {results.isFetching
                ? "Searching…"
                : q
                  ? "No nodes found."
                  : "Type to search your knowledge base."}
            </CommandEmpty>
            {results.data?.hits.map((hit) => (
              <CommandItem
                key={hit.id}
                value={hit.id}
                onSelect={() => {
                  setOpen(false);
                  void navigate({ to: "/graph", search: { focus: hit.id } });
                }}
              >
                <Badge type={hit.type}>{label(hit.type)}</Badge>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{hit.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {hit.id}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        <ErrorMessage error={results.error} />
      </Dialog>
    </div>
  );
}
