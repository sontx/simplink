import { useWorkspace } from "../workspace/context.js";
import { usePreferences } from "./preferences.js";
import { cn } from "../lib/utils.js";
import { useEffect, useMemo, useState, type FocusEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  Panel,
  type Connection,
  type NodeProps,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { Maximize2, Minimize2, Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { schemaQuery, type Snapshot } from "../api.js";
import {
  applyLayoutChanges,
  neighborhood,
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
type GraphNode = Node<
  {
    title: string;
    type: string;
    count: number;
    error: boolean;
    ghost: boolean;
  },
  "knowledge"
>;

function KnowledgeNode({ data, selected }: NodeProps<GraphNode>) {
  const { label } = usePreferences();

  return (
    <div
      className={cn(
        data.type,
        "relative h-22.5 w-57.5 rounded-[7px] border bg-card px-3.75 py-3.25 shadow-[0_2px_7px_#44354c08] transition-[box-shadow,border-color] duration-200 [&_.react-flow__handle]:size-1.75 [&_.react-flow__handle]:border-2 [&_.react-flow__handle]:border-card [&_.react-flow__handle]:bg-muted-foreground",
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
      <strong className="mt-2 block max-w-48.75 truncate text-xs font-[550] text-foreground">
        {data.title}
      </strong>
      {data.count > 0 && (
        <span
          className={cn(
            "absolute -top-1.75 -right-1.5 size-5.5 rounded-full border-2 border-card text-center text-[10px] leading-4.5",
            data.error
              ? "bg-destructive text-white"
              : "bg-warning/10 text-warning",
          )}
        >
          {data.count}
        </span>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { knowledge: KnowledgeNode };

const groupOrder = [
  "goal",
  "procedure",
  "capability",
  "state",
  "constraint",
  "missing",
];

/** Collapsible search over the nodes currently shown on the canvas. */
function NodeSearch({
  nodes,
  onJump,
}: {
  nodes: GraphNode[];
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
            {groupOrder.map((type) => {
              const group = nodes.filter((n) => n.data.type === type);
              return (
                group.length > 0 && (
                  <CommandGroup key={type} heading={label(type)}>
                    {group.map((n) => (
                      <CommandItem
                        key={n.id}
                        value={`${n.data.title} ${n.id}`}
                        title={`${n.data.title}\n${n.id}`}
                        onSelect={() => {
                          onJump(n.id);
                          setOpen(false);
                        }}
                      >
                        <span className="truncate">{n.data.title}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )
              );
            })}
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
}) {
  const { service } = useWorkspace();
  const { t, label, enumDescription, theme } = usePreferences();
  const { data: schema } = useQuery(schemaQuery(service));
  const client = useQueryClient();
  const [connection, setConnection] = useState<Connection>();
  const [layout, setLayout] = useState<Record<string, NodeLayout>>({});
  const [flow, setFlow] = useState<ReactFlowInstance<GraphNode>>();
  const [create, setCreate] = useState<string>();
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
  const { nodes, edges } = useMemo(() => {
    const subset = neighborhood(kb.nodes, kb.edges, focus, depth, filters);
    const known = new Map(kb.nodes.map((n) => [n.id, n]));
    const graph = new dagre.graphlib.Graph()
      .setGraph({ rankdir: "LR", nodesep: 40, ranksep: 90 })
      .setDefaultEdgeLabel(() => ({}));
    const ids = new Set([
      ...subset.nodes.map((n) => n.id),
      ...subset.edges.map((e) => e.to),
    ]);
    for (const id of ids) graph.setNode(id, { width: 230, height: 90 });
    for (const e of subset.edges) graph.setEdge(e.from, e.to);
    dagre.layout(graph);
    const flowNodes: GraphNode[] = [...ids].map((id) => {
      const n = known.get(id);
      const issues = kb.issues.filter((i) => i.path === n?.path);
      const p = graph.node(id);
      return {
        id,
        type: "knowledge",
        selected: id === focus,
        position: { x: p.x - 115, y: p.y - 45 },
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
      nodes: flowNodes,
      edges: subset.edges.map((e, i) => {
        const bad =
          !known.has(e.to) || (e.kind === "requires" && cyclic(e.from, e.to));
        return {
          id: `${e.from}-${e.to}-${e.kind}-${i}`,
          source: e.from,
          target: e.to,
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
            fontSize: 10,
            fill: bad ? "var(--destructive)" : "var(--muted-foreground)",
          },
        };
      }),
    };
  }, [kb, focus, depth, filters, label, enumDescription]);
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
  useEffect(() => {
    void flow?.fitView({ padding: 0.25 });
  }, [flow, focus, depth, visibleIds]);
  const source = kb.nodes.find((n) => n.id === connection?.source);
  const target = kb.nodes.find((n) => n.id === connection?.target);
  const kinds = Object.entries(schema?.[source?.type ?? ""] ?? {})
    .filter(([, type]) => type === "node" || type === target?.type)
    .map(([kind]) => kind);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={!editable}>
        <div className="relative min-w-0 flex-1 bg-background">
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
            onNodesChange={(changes) =>
              setLayout((current) => applyLayoutChanges(current, changes))
            }
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            onNodeClick={(_e, node) => onFocus(node.id)}
            onPaneClick={onPaneClick}
            nodesConnectable={editable}
            onConnect={editable ? setConnection : undefined}
            minZoom={0.15}
          >
            <Background gap={22} size={1} color="var(--border)" />
            <Controls />
            <Panel position="top-right" className="flex items-start gap-1.5">
              <NodeSearch nodes={positionedNodes} onJump={onFocus} />
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
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) =>
                n.data.type === "goal" ? "#8b78b5" : "#b4b9c3"
              }
            />
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
                kinds.map((kind) => (
                  <Button
                    variant="outline"
                    key={kind}
                    title={enumDescription(kind)}
                    disabled={patch.isPending}
                    onClick={() => patch.mutate(kind)}
                  >
                    {label(kind)}
                  </Button>
                ))
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
        {["goal", "procedure", "capability", "state", "constraint"].map(
          (type) => (
            <ContextMenuItem
              key={type}
              title={enumDescription(type)}
              onSelect={() => setCreate(type)}
            >
              {t("New {type} here…", { type: label(type).toLowerCase() })}
            </ContextMenuItem>
          ),
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
