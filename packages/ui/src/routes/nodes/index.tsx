import { NODE_TYPES } from "@sontx/simplink-core/browser";
import { useWorkspace } from "../../workspace/context.js";
import { usePreferences } from "../../components/preferences.js";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Plus,
} from "lucide-react";
import { kbQuery, type NodeSummary } from "../../api.js";
import {
  Badge,
  Button,
  Glossary,
  Input,
  Page,
} from "../../components/ui/primitives.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table.js";
import { ButtonGroup } from "../../components/ui/button-group.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.js";
import { NodeDialog } from "../../components/node-dialog.js";
import { cn } from "../../lib/utils.js";
import { DeletedNotice } from "../../components/deleted-notice.js";
export const Route = createFileRoute("/nodes/")({
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    type?: string;
    status?: string;
    tag?: string;
    q?: string;
    sort?: string;
    desc?: boolean;
  } => ({
    type: String(s.type ?? ""),
    status: String(s.status ?? ""),
    tag: String(s.tag ?? ""),
    q: String(s.q ?? ""),
    sort: String(s.sort ?? "id"),
    desc: s.desc === true || s.desc === "true",
  }),
  component: Nodes,
});

type NodeRow = NodeSummary & {
  in: number;
  out: number;
  issues: number;
  errors: number;
};

/** A relationship count in the graph's own language: an arrow and a number. */
function LinkCount({ count, dir }: { count: number; dir: "in" | "out" }) {
  const Arrow = dir === "in" ? ArrowLeft : ArrowRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tabular-nums",
        !count && "text-muted-foreground",
      )}
    >
      <Arrow aria-hidden className="size-3 text-muted-foreground" />
      {count}
    </span>
  );
}

const PAGE_SIZES = [10, 20, 50, 100];

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});
const helper = createColumnHelper<typeof features, NodeRow>();

function Nodes() {
  const { service } = useWorkspace();
  const { t, label, enumDescription } = usePreferences();

  const columns = useMemo(
    () =>
      helper.columns([
        // Title first: it is what people scan for, and on a phone it stays on screen.
        helper.accessor("title", {
          header: () => t("Title"),
          cell: ({ row, getValue }) => (
            <Link
              to="/nodes/$id"
              params={{ id: row.original.id }}
              className="block max-w-80 truncate font-medium text-foreground hover:text-primary-ink max-[480px]:max-w-52"
              onClick={(e) => e.stopPropagation()}
            >
              {getValue()}
            </Link>
          ),
        }),
        helper.accessor("type", {
          header: () => t("Type"),
          cell: ({ getValue }) => (
            <Badge type={getValue()}>{label(getValue())}</Badge>
          ),
        }),
        // Machine truth in muted mono; the title is the one link per row (One Pen Rule).
        helper.accessor("id", {
          header: () => t("ID"),
          cell: ({ getValue }) => (
            <span className="font-mono text-xs text-muted-foreground">
              {getValue()}
            </span>
          ),
        }),
        helper.accessor("status", {
          header: () => t("Status"),
          cell: ({ getValue }) => (
            <span>
              <span
                aria-hidden
                className={`mr-1.5 inline-block size-1.5 rounded-full align-middle ${getValue() === "deprecated" ? "bg-warning" : "bg-success"}`}
              />
              {label(getValue())}
            </span>
          ),
        }),
        helper.accessor((n) => n.tags.join(", "), {
          id: "tags",
          header: () => t("Tags"),
          cell: ({ getValue }) => (
            <span className="text-muted-foreground">{getValue() || "—"}</span>
          ),
        }),
        helper.accessor("in", {
          header: () => t("Incoming"),
          cell: ({ getValue }) => <LinkCount count={getValue()} dir="in" />,
        }),
        helper.accessor("out", {
          header: () => t("Outgoing"),
          cell: ({ getValue }) => <LinkCount count={getValue()} dir="out" />,
        }),
        // The graph node's count bubble: solid red with an error, ochre wash otherwise.
        helper.accessor("issues", {
          header: () => t("Issues"),
          cell: ({ row, getValue }) =>
            getValue() ? (
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums",
                  row.original.errors
                    ? "bg-destructive text-white"
                    : "warning bg-(--type-bg) text-(--type-ink)",
                )}
              >
                {getValue()}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        }),
      ]),
    [t, label],
  );
  const { data: kb } = useQuery(kbQuery(service));
  const s = Route.useSearch();
  const navigate = Route.useNavigate();
  const [create, setCreate] = useState<string>();
  const update = (v: Partial<typeof s>) =>
    void navigate({ search: (old) => ({ ...old, ...v }) });

  const rows = useMemo<NodeRow[]>(() => {
    if (!kb) return [];
    const count = (keys: string[]) =>
      keys.reduce(
        (m, k) => m.set(k, (m.get(k) ?? 0) + 1),
        new Map<string, number>(),
      );
    const ins = count(kb.edges.map((e) => e.to));
    const outs = count(kb.edges.map((e) => e.from));
    const issues = count(kb.issues.map((i) => i.path));
    const errors = count(
      kb.issues.filter((i) => i.severity === "error").map((i) => i.path),
    );
    const q = (s.q ?? "").toLowerCase();
    return kb.nodes
      .filter(
        (n) =>
          (!s.type || n.type === s.type) &&
          (!s.status || n.status === s.status) &&
          (!s.tag || n.tags.includes(s.tag)) &&
          `${n.id} ${n.title} ${n.summary}`.toLowerCase().includes(q),
      )
      .map((n) => ({
        ...n,
        in: ins.get(n.id) ?? 0,
        out: outs.get(n.id) ?? 0,
        issues: issues.get(n.path) ?? 0,
        errors: errors.get(n.path) ?? 0,
      }));
  }, [kb, s.type, s.status, s.tag, s.q]);

  // Must be referentially stable: a new array each render resets pagination.
  const sorting = useMemo<SortingState>(
    () => [{ id: s.sort ?? "id", desc: !!s.desc }],
    [s.sort, s.desc],
  );
  const table = useTable({
    features,
    columns,
    data: rows,
    state: { sorting },
    onSortingChange: (updater: Updater<SortingState>) => {
      const [next] = typeof updater === "function" ? updater(sorting) : updater;
      update({ sort: next?.id ?? "id", desc: next?.desc ?? false });
    },
    enableSortingRemoval: false,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  });

  if (!kb) return <Page>{t("Loading nodes…")}</Page>;
  const filtered = !!(s.q || s.type || s.status || s.tag);
  const { pageIndex, pageSize } = table.state.pagination;
  const first = rows.length ? pageIndex * pageSize + 1 : 0;
  const last = Math.min((pageIndex + 1) * pageSize, rows.length);

  return (
    <Page>
      <DeletedNotice className="mb-5" />
      <div className="mb-6.25 flex items-center justify-between gap-6.25 max-[780px]:gap-2.5">
        <div>
          <h1 className="mb-2">
            {t("Nodes")}
            <span className="ml-2 inline-flex align-middle">
              <Badge>{rows.length}</Badge>
            </span>
          </h1>
        </div>
        {!service.store.readOnly && (
          <ButtonGroup>
            <Button variant="outline" onClick={() => setCreate("goal")}>
              <Plus />
              {t("Add goal")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={t("Add other node types")}
                >
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  {NODE_TYPES.filter(
                    (type) => type !== "goal" && type !== "simp",
                  ).map((type) => (
                    <DropdownMenuItem
                      key={type}
                      onSelect={() => setCreate(type)}
                    >
                      {t("Add {type}", { type: label(type).toLowerCase() })}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        )}
      </div>
      <div className="my-6.25 flex gap-2.5 max-[780px]:flex-wrap">
        <Input
          className="sm:mr-auto sm:max-w-sm"
          aria-label={t("Filter nodes")}
          placeholder={t("Filter by title or ID…")}
          value={s.q}
          onChange={(e) => update({ q: e.target.value })}
        />
        <Select
          value={s.type || "all"}
          onValueChange={(value) =>
            update({ type: value === "all" ? "" : value })
          }
        >
          <SelectTrigger aria-label={t("Node type")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">{t("All types")}</SelectItem>
              {NODE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {label(type)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={s.status || "all"}
          onValueChange={(value) =>
            update({ status: value === "all" ? "" : value })
          }
        >
          <SelectTrigger aria-label={t("Node status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">{t("All statuses")}</SelectItem>
              <SelectItem value="active">{t("Active")}</SelectItem>
              <SelectItem value="deprecated">{t("Deprecated")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={s.tag ? "tag:" + s.tag : "all"}
          onValueChange={(value) =>
            update({ tag: value === "all" ? "" : value.slice(4) })
          }
        >
          <SelectTrigger aria-label={t("Tag")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">{t("All tags")}</SelectItem>
              {[...new Set(kb.nodes.flatMap((n) => n.tags))]
                .sort()
                .map((tag) => (
                  <SelectItem key={tag} value={"tag:" + tag}>
                    {tag}
                  </SelectItem>
                ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <Glossary
        className="-mt-2.5 mb-5"
        entries={[
          ...NODE_TYPES.map((type) => ({
            key: type,
            term: <Badge type={type}>{label(type)}</Badge>,
            description: enumDescription(type),
          })),
          ...["active", "deprecated"].map((status) => ({
            key: status,
            term: label(status),
            description: enumDescription(status),
          })),
        ]}
      />
      <div className="overflow-hidden rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const Icon =
                    sorted === "asc"
                      ? ArrowUp
                      : sorted === "desc"
                        ? ArrowDown
                        : ArrowUpDown;
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : "none"
                      }
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2.5"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <table.FlexRender header={header} />
                        <Icon className={sorted ? undefined : "opacity-40"} />
                      </Button>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() =>
                    void navigate({
                      to: "/nodes/$id",
                      params: { id: row.original.id },
                    })
                  }
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {t("No nodes match these filters.")}
                  {filtered && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-3"
                      onClick={() =>
                        update({ q: "", type: "", status: "", tag: "" })
                      }
                    >
                      {t("Clear filters")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 py-4 text-sm text-muted-foreground">
        <span>
          {t("{first}–{last} of {total}", { first, last, total: rows.length })}
        </span>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <span>{t("Rows per page")}</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger size="sm" aria-label={t("Rows per page")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <span>
            {t("Page {page} of {total}", {
              page: pageIndex + 1,
              total: Math.max(table.getPageCount(), 1),
            })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("First page")}
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.setPageIndex(0)}
            >
              <ChevronsLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("Previous page")}
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("Next page")}
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("Last page")}
              disabled={!table.getCanNextPage()}
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            >
              <ChevronsRight />
            </Button>
          </div>
        </div>
      </div>
      {create && (
        <NodeDialog
          type={create}
          onClose={() => setCreate(undefined)}
          onCreated={(id) =>
            void navigate({ to: "/nodes/$id", params: { id } })
          }
        />
      )}
    </Page>
  );
}
