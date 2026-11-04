import { NODE_TYPES } from "@sontx/simplink-core/browser";
import { useWorkspace } from "../workspace/context.js";
import { usePreferences } from "./preferences.js";
import { cn, groupByType } from "../lib/utils.js";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type ReactNode,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ControlButton,
  Handle,
  Position,
  MarkerType,
  Panel,
  type Connection,
  type NodeProps,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import { Map as MapIcon, Maximize2, Minimize2, Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { schemaQuery, type Snapshot } from "../api.js";
import {
  applyLayoutChanges,
  clusterGraph,
  laneLayout,
  neighborhood,
  type Cluster,
  type GraphFilters,
  type NodeLayout,
} from "../graph.js";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "./ui/context-menu.js";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "./ui/command.js";
import { Badge, Button, Dialog, ErrorMessage } from "./ui/primitives.js";
import { NodeDialog } from "./node-dialog.js";
type KnowledgeData = {
  title: string;
  type: string;
  count: number;
  error: boolean;
  ghost: boolean;
};

type ClusterNode = Node<Cluster, "cluster">;

type LaneNode = Node<{ type: string; count: number }, "lane">;

type GraphNode = Node<KnowledgeData, "knowledge"> | ClusterNode | LaneNode;

function KnowledgeNode({
  data,
  selected,
}: NodeProps<Node<KnowledgeData, "knowledge">>) {
  const { label } = usePreferences();

  return (
    <div
      className={cn(
        data.type,
        "relative h-22.5 w-57.5 rounded-[7px] border bg-card px-3.75 py-3.25 shadow-[0_2px_7px_#44354c08] transition-[box-shadow,border-color] duration-200",
        data.ghost
          ? "border-dashed border-border bg-destructive/10"
          : selected
            ? "border-l-3 border-primary"
            : "border-l-3 border-border border-l-(--type-color)",
        selected &&
          "shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_12%,transparent)]",
      )}
    >
      <Handle type="target" position={Position.Left} />
      <Badge type={data.type}>
        {label(data.ghost ? "missing" : data.type)}
      </Badge>
      {/* Two lines, so most titles read whole at the canvas's readable zoom. */}
      <strong className="mt-1.5 line-clamp-2 block max-w-48.75 text-xs leading-4 font-[550] text-foreground">
        {data.title}
      </strong>
      {data.count > 0 && (
        <span
          className={cn(
            "absolute -top-1.75 -right-1.5 size-5.5 rounded-full border-2 border-card text-center text-[9px] leading-4.5",
            data.error
              ? "bg-destructive text-white"
              : "warning bg-(--type-bg) text-(--type-ink)",
          )}
        >
          {data.count}
        </span>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/** One area folder on the whole map: its name, size, type mix and problems. */
function ClusterCard({ data }: NodeProps<ClusterNode>) {
  const { t, label } = usePreferences();
  const issues = data.errors + data.warnings;
  return (
    <div className="relative h-22.5 w-57.5 cursor-pointer rounded-[7px] border border-border bg-card px-3.75 py-3 shadow-[0_2px_7px_#44354c08] transition-[border-color] duration-200 hover:border-ring/60">
      <Handle type="target" position={Position.Left} />
      <strong className="block truncate text-sm font-[550] text-foreground">
        {data.area ? label(data.area) : t("Top level")}
      </strong>
      <span className="block text-xs text-muted-foreground">
        {data.count === 1
          ? t("1 node")
          : t("{count} nodes", { count: data.count })}
      </span>
      {/* The map inks, one dot per type with its count. */}
      <span className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-xs text-muted-foreground tabular-nums">
        {data.types.map(([type, count]) => (
          <span key={type} className="inline-flex items-center gap-1">
            <span
              aria-hidden
              className={`${type} size-1.5 rounded-full bg-(--type-color)`}
            />
            <span className="sr-only">{label(type)}</span>
            {count}
          </span>
        ))}
      </span>
      {issues > 0 && (
        <span
          className={cn(
            "absolute -top-1.75 -right-1.5 size-5.5 rounded-full border-2 border-card text-center text-[9px] leading-4.5",
            data.errors
              ? "bg-destructive text-white"
              : "warning bg-(--type-bg) text-(--type-ink)",
          )}
        >
          {issues}
        </span>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/** The heading over one plan-order column. */
function LaneHeading({ data }: NodeProps<LaneNode>) {
  const { t, label } = usePreferences();
  return (
    <div className="w-57.5 text-xs font-[650] text-muted-foreground">
      {data.type === "missing"
        ? t("Missing")
        : data.type === "other"
          ? t("Other")
          : label(data.type)}
      <span className="ml-1.5 font-normal tabular-nums">{data.count}</span>
    </div>
  );
}
const nodeTypes = {
  knowledge: KnowledgeNode,
  cluster: ClusterCard,
  lane: LaneHeading,
};
// Below this zoom, edge labels are noise rather than information.
const LABEL_ZOOM = 0.55;
const MINIMAP_KEY = "simplink.minimap";
const NARROW = "(max-width: 780px)";
// The minimap panel's footprint at the canvas's bottom-right, with its margin.
const MINIMAP_SPACE = { width: 215, height: 165 };

/** Collapsible search over the nodes currently shown on the canvas. */
function NodeSearch({
  nodes,
  onJump,
}: {
  nodes: { id: string; title: string; type: string }[];
  onJump: (id: string) => void;
}) {
  const { t, label } = usePreferences();
  const [open, setOpen] = useState(false);
  const close = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
  };
  return (
    <div
      className={cn(
        "transition-[width] duration-200 ease-out",
        open ? "w-64" : "w-7",
      )}
      onBlur={close}
    >
      {open ? (
        <Command
          className="h-auto border border-border shadow-md"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        >
          <CommandInput autoFocus placeholder={t("Search nodes…")} />
          <CommandList>
            <CommandEmpty>{t("No matching nodes in view.")}</CommandEmpty>
            {groupByType(nodes, (n) => n.type).map(([type, group]) => (
              <CommandGroup key={type} heading={label(type)}>
                {group.map((n) => (
                  <CommandItem
                    key={n.id}
                    value={`${n.title} ${n.id}`}
                    onSelect={() => {
                      onJump(n.id);
                      setOpen(false);
                    }}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{n.title}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {n.id}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      ) : (
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("Search nodes in view")}
          title={t("Search nodes in view")}
          onClick={() => setOpen(true)}
        >
          <Search />
        </Button>
      )}
    </div>
  );
}
const emptyFilters: GraphFilters = {};
export function KBGraph({
  kb,
  focus,
  depth = 1,
  filters = emptyFilters,
  onFocus,
  onPaneClick,
  expanded,
  onExpandedChange,
  editable = true,
  minimap = true,
  overview = false,
  panel,
}: {
  kb: Snapshot;
  focus?: string;
  depth?: number | "all";
  filters?: GraphFilters;
  onFocus: (id: string) => void;
  onPaneClick?: () => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  editable?: boolean;
  /** Off for small embedded graphs, where the minimap would cover nodes. */
  minimap?: boolean;
  /** The whole map: fit everything, however small. Otherwise open readable around the focus. */
  overview?: boolean;
  /** Extra canvas controls, pinned top-left. */
  panel?: ReactNode;
}) {
  const { service } = useWorkspace();
  editable &&= !service.store.readOnly;
  const { t, label, enumDescription, theme } = usePreferences();
  const { data: schema } = useQuery(schemaQuery(service));
  const client = useQueryClient();
  const [connection, setConnection] = useState<Connection>();
  const [layout, setLayout] = useState<Record<string, NodeLayout>>({});
  const [flow, setFlow] = useState<ReactFlowInstance<GraphNode>>();
  const [create, setCreate] = useState<string>();
  const [zoomedOut, setZoomedOut] = useState(false);
  // The minimap folds away on request and remembers it for this browser.
  const [mapOpen, setMapOpen] = useState(() => {
    try {
      return localStorage.getItem(MINIMAP_KEY) !== "closed";
    } catch {
      return true;
    }
  });
  const toggleMap = () =>
    setMapOpen((open) => {
      try {
        localStorage.setItem(MINIMAP_KEY, open ? "closed" : "open");
      } catch {
        /* Storage may be unavailable; the choice then lasts this session. */
      }
      return !open;
    });
  // Phones hide the minimap in CSS, so they reserve no room for it either.
  const narrow = useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(NARROW);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
  const showMap = minimap && !overview && mapOpen && !narrow;
  const patch = useMutation({
    mutationFn: (kind: string) =>
      service.patchEdges(connection!.source!, kind, [
        ...new Set([
          ...kb.edges
            .filter(
              (e) =>
                e.from === connection!.source &&
                e.kind === kind &&
                e.source === "frontmatter",
            )
            .map((e) => e.to),
          connection!.target!,
        ]),
      ]),
    onSuccess: async () => {
      setConnection(undefined);
      await client.invalidateQueries();
    },
  });
  const { nodes, edges, searchable } = useMemo(() => {
    if (overview) {
      const subset = neighborhood(
        kb.nodes,
        kb.edges,
        undefined,
        "all",
        filters,
      );
      const { clusters, links } = clusterGraph(
        subset.nodes,
        subset.edges,
        kb.issues,
      );
      // Areas link every which way, so a ranked layout sprawls; a near-square
      // grid keeps every card at a readable zoom.
      const columns = narrow ? 2 : Math.ceil(Math.sqrt(clusters.length));
      return {
        searchable: subset.nodes,
        nodes: clusters.map((c, i): GraphNode => {
          return {
            id: c.id,
            type: "cluster",
            position: {
              x: (i % columns) * (230 + 110),
              y: Math.floor(i / columns) * (90 + 80),
            },
            data: c,
            connectable: false,
          };
        }),
        edges: links.map((l) => ({
          id: `${l.from}-${l.to}`,
          source: l.from,
          target: l.to,
          label: String(l.weight),
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "var(--muted-foreground)",
          },
          // Heavier links between areas draw heavier.
          style: {
            stroke: "var(--muted-foreground)",
            strokeOpacity: 0.55,
            strokeWidth: 1 + Math.min(Math.log2(l.weight), 2) * 0.75,
          },
          labelBgStyle: { fill: "var(--card)" },
          labelStyle: {
            fontSize: 11,
            fill: "var(--muted-foreground)",
          },
        })),
      };
    }
    const subset = neighborhood(kb.nodes, kb.edges, focus, depth, filters);
    const known = new Map(kb.nodes.map((n) => [n.id, n]));
    const ids = new Set([
      ...subset.nodes.map((n) => n.id),
      ...subset.edges.map((e) => e.to),
    ]);
    // Plan-order lanes: goals, then procedures, capabilities, states, constraints.
    const { positions, lanes } = laneLayout(
      [...ids].map((id) => ({ id, type: known.get(id)?.type ?? "missing" })),
      subset.edges,
    );
    const headings: GraphNode[] = lanes.map((lane) => ({
      id: `lane:${lane.type}`,
      type: "lane",
      position: { x: lane.x, y: lane.top - 30 },
      data: { type: lane.type, count: lane.count },
      selectable: false,
      draggable: false,
      focusable: false,
      connectable: false,
    }));
    const flowNodes: GraphNode[] = [...ids].map((id) => {
      const n = known.get(id);
      const issues = kb.issues.filter((i) => i.path === n?.path);
      const type = n?.type ?? "missing";
      return {
        id,
        type: "knowledge",
        selected: id === focus,
        position: positions.get(id)!,
        // Named for screen readers by type, title and problems.
        ariaLabel: [
          `${label(n ? type : "missing")}: ${n?.title ?? id}`,
          issues.length
            ? issues.length === 1
              ? t("1 issue")
              : t("{count} issues", { count: issues.length })
            : "",
        ]
          .filter(Boolean)
          .join(", "),
        data: {
          title: n?.title ?? id,
          type: n?.type ?? "missing",
          ghost: !n,
          count: issues.length,
          error: issues.some((i) => i.severity === "error"),
        },
      };
    });
    const cyclic = (from: string, to: string) => {
      const seen = new Set<string>();
      const stack = [to];
      while (stack.length) {
        const id = stack.pop()!;
        if (id === from) return true;
        if (seen.has(id)) continue;
        seen.add(id);
        stack.push(
          ...kb.edges
            .filter((e) => e.kind === "requires" && e.from === id)
            .map((e) => e.to),
        );
      }
      return false;
    };
    return {
      searchable: subset.nodes,
      nodes: [...headings, ...flowNodes],
      edges: subset.edges.map((e, i) => {
        const bad =
          !known.has(e.to) || (e.kind === "requires" && cyclic(e.from, e.to));
        // The focused node's own relationships lead; the rest recede until hovered.
        const adjacent = !focus || e.from === focus || e.to === focus;
        return {
          id: `${e.from}-${e.to}-${e.kind}-${i}`,
          source: e.from,
          target: e.to,
          // Edges stay under the cards, so a label that crosses a lane hides behind it.
          className: adjacent ? undefined : "edge-dim",
          label: (
            <tspan>
              <title>{enumDescription(e.kind)}</title>
              {label(e.kind)}
            </tspan>
          ),
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: bad ? "var(--destructive)" : "var(--muted-foreground)",
          },
          style: {
            stroke: bad ? "var(--destructive)" : "var(--muted-foreground)",
            strokeDasharray: !known.has(e.to) ? "5 4" : undefined,
          },
          labelBgStyle: { fill: "var(--card)" },
          labelStyle: {
            pointerEvents: "all" as const,
            fontSize: 11,
            fill: bad ? "var(--destructive)" : "var(--muted-foreground)",
          },
        };
      }),
    };
  }, [kb, focus, depth, filters, label, enumDescription, overview, t, narrow]);
  const positionedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        position: layout[node.id]?.position ?? node.position,
        measured: layout[node.id]?.measured,
      })),
    [nodes, layout],
  );
  const visibleIds = nodes.map((node) => node.id).join();
  // Around a focus, frame the node and its direct neighbours at a zoom where
  // card titles stay legible; the rest of the neighbourhood extends off-canvas.
  const framed = useMemo(() => {
    if (overview || !focus || !visibleIds.split(",").includes(focus))
      return undefined;
    const ids = new Set([focus]);
    for (const e of edges) {
      if (e.source === focus) ids.add(e.target);
      if (e.target === focus) ids.add(e.source);
    }
    return [...ids].map((id) => ({ id }));
  }, [overview, focus, edges, visibleIds]);
  const fitOptions = framed
    ? {
        nodes: framed,
        // Room on the right so the minimap never sits on the framed cards.
        padding: {
          top: "40px",
          left: "24px",
          bottom: "24px",
          right: `${showMap ? MINIMAP_SPACE.width + 24 : 24}px`,
        } as const,
        // 12px titles stay legible; the rest of the neighbourhood pans.
        minZoom: 0.85,
        maxZoom: 1,
      }
    : overview
      ? // Cards stay legible; a phone pans the rest.
        { padding: 0.15, minZoom: 0.6, maxZoom: 1 }
      : { padding: 0.25 };
  const canvas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!flow) return;
    void flow.fitView(fitOptions).then(() => {
      // At the readable zoom a wide neighbourhood can push the focus off the
      // edge; pan just enough to keep the focused card fully on screen.
      const node = focus && framed ? flow.getNode(focus) : undefined;
      const box = canvas.current?.getBoundingClientRect();
      if (!node || !box) return;
      const { x, y, zoom } = flow.getViewport();
      const pad = 24;
      // Keep the card left of the minimap when it would land underneath it.
      const nodeBottom = y + (node.position.y + 90) * zoom;
      const width =
        showMap && nodeBottom > box.height - MINIMAP_SPACE.height
          ? box.width - MINIMAP_SPACE.width
          : box.width;
      const keep = (offset: number, at: number, size: number, room: number) =>
        Math.min(
          Math.max(offset, pad - at * zoom),
          room - pad - (at + size) * zoom,
        );
      void flow.setViewport({
        x: keep(x, node.position.x, 230, width),
        y: keep(y, node.position.y, 90, box.height),
        zoom,
      });
    });
    // fitOptions is derived from framed, which carries the identity.
  }, [flow, framed, depth, visibleIds, showMap]);
  const source = kb.nodes.find((n) => n.id === connection?.source);
  const target = kb.nodes.find((n) => n.id === connection?.target);
  const kinds = Object.entries(schema?.[source?.type ?? ""] ?? {})
    .filter(([, type]) => type === "node" || type === target?.type)
    .map(([kind]) => kind);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={!editable}>
        <div
          ref={canvas}
          data-zoomed-out={zoomedOut || undefined}
          className="group/canvas relative min-w-0 flex-1 bg-background"
        >
          <ReactFlow
            colorMode={theme}
            ariaLabelConfig={{
              "node.a11yDescription.default": t(
                "Select a node with Enter or Space; move it with the arrow keys. Press Escape to cancel.",
              ),
              "node.a11yDescription.keyboardDisabled": t(
                "Select a node with Enter or Space. Press Escape to cancel.",
              ),
              "node.a11yDescription.ariaLiveMessage": ({ direction, x, y }) =>
                t("Moved node {direction}. Position: {x}, {y}.", {
                  direction: t(direction),
                  x,
                  y,
                }),
              "edge.a11yDescription.default": t(
                "Select a relationship with Enter or Space. Press Escape to cancel.",
              ),
              "controls.ariaLabel": t("Graph controls"),
              "controls.zoomIn.ariaLabel": t("Zoom in"),
              "controls.zoomOut.ariaLabel": t("Zoom out"),
              "controls.fitView.ariaLabel": t("Fit view"),
              "controls.interactive.ariaLabel": t("Toggle interactivity"),
              "minimap.ariaLabel": t("Mini map"),
              "handle.ariaLabel": t("Connection handle"),
            }}
            aria-label={t("Knowledge graph canvas")}
            onInit={setFlow}
            nodes={positionedNodes}
            onNodesChange={(changes) => {
              setLayout((current) => applyLayoutChanges(current, changes));
              // Enter or Space on a focused node selects it: open it like a click.
              const picked = changes.find(
                (change) => change.type === "select" && change.selected,
              );
              const node =
                picked && "id" in picked
                  ? nodes.find((n) => n.id === picked.id)
                  : undefined;
              if (node?.type === "cluster") onFocus(node.data.entry);
              else if (node?.type === "knowledge" && node.id !== focus)
                onFocus(node.id);
            }}
            // Tab reaches nodes, not the dozens of edges between them.
            edgesFocusable={false}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={fitOptions}
            onNodeClick={(_e, node) =>
              node.type === "cluster"
                ? onFocus(node.data.entry)
                : node.type === "knowledge" && onFocus(node.id)
            }
            onMove={(_e, viewport) => setZoomedOut(viewport.zoom < LABEL_ZOOM)}
            onPaneClick={onPaneClick}
            nodesConnectable={editable}
            onConnect={editable ? setConnection : undefined}
            minZoom={0.15}
          >
            <Background gap={22} size={1} color="var(--border)" />
            <Controls>
              {minimap && !overview && !narrow && (
                <ControlButton
                  onClick={toggleMap}
                  aria-pressed={mapOpen}
                  aria-label={t(mapOpen ? "Hide minimap" : "Show minimap")}
                  title={t(mapOpen ? "Hide minimap" : "Show minimap")}
                >
                  <MapIcon />
                </ControlButton>
              )}
            </Controls>
            {panel && (
              <Panel position="top-left" className="max-w-[calc(100%-6rem)]">
                {panel}
              </Panel>
            )}
            <Panel position="top-right" className="flex items-start gap-1.5">
              <NodeSearch nodes={searchable} onJump={onFocus} />
              {onExpandedChange && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-pressed={expanded}
                  aria-label={t(
                    expanded ? "Collapse diagram" : "Expand diagram",
                  )}
                  title={t(expanded ? "Collapse diagram" : "Expand diagram")}
                  onClick={() => onExpandedChange(!expanded)}
                >
                  {expanded ? <Minimize2 /> : <Maximize2 />}
                </Button>
              )}
            </Panel>
            {/* At fit-all the minimap would only repeat the canvas. */}
            {showMap && nodes.length > 0 && (
              <MiniMap<GraphNode>
                pannable
                zoomable
                // The type class on each rect sets --type-color for its theme.
                nodeClassName={(n) =>
                  n.type !== "knowledge"
                    ? ""
                    : n.data.ghost
                      ? "error"
                      : n.data.type
                }
                nodeColor={(n) =>
                  n.type === "lane" ? "transparent" : "var(--type-color)"
                }
              />
            )}
          </ReactFlow>
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-x-[20%] top-[45%] text-center text-xs text-muted-foreground">
              {t("No nodes match these filters. Try another depth or type.")}
            </div>
          )}
          {connection && (
            <Dialog
              open
              onOpenChange={() => setConnection(undefined)}
              title={t("Connect nodes")}
            >
              <p>
                {source?.title} → {target?.title}
              </p>
              <ErrorMessage error={patch.error} />
              {kinds.length ? (
                <div className="flex flex-col gap-2">
                  {kinds.map((kind) => (
                    <Button
                      variant="outline"
                      key={kind}
                      className="h-auto flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
                      disabled={patch.isPending}
                      onClick={() => patch.mutate(kind)}
                    >
                      {label(kind)}
                      {enumDescription(kind) && (
                        <span className="text-xs font-normal text-muted-foreground">
                          {enumDescription(kind)}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              ) : (
                <p>{t("No valid relationship kinds for these node types.")}</p>
              )}
            </Dialog>
          )}
          {create && (
            <NodeDialog
              type={create}
              onClose={() => setCreate(undefined)}
              onCreated={onFocus}
            />
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {NODE_TYPES.filter((type) => type !== "simp").map((type) => (
          <ContextMenuItem key={type} onSelect={() => setCreate(type)}>
            {t("New {type} here…", { type: label(type).toLowerCase() })}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
