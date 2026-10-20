import { cn, label } from "../lib/utils.js";
import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type Connection,
  type NodeProps,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, schemaQuery, type Snapshot } from "../api.js";
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
  return (
    <div
      className={cn(
        data.type,
        "relative h-22.5 w-57.5 rounded-[7px] border bg-card px-3.75 py-3.25 shadow-[0_2px_7px_#44354c08] transition-[box-shadow,border-color] duration-200 [&_.react-flow__handle]:size-1.75 [&_.react-flow__handle]:border-2 [&_.react-flow__handle]:border-white [&_.react-flow__handle]:bg-[#b8a9c7]",
        data.ghost
          ? "border-dashed border-[#cf6971] bg-[#fff8f8]"
          : selected
            ? "border-l-3 border-primary"
            : "border-l-3 border-[#e2dce9] border-l-(--type-color)",
        selected &&
          "shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_12%,transparent)]",
      )}
    >
      <Handle type="target" position={Position.Left} />
      <Badge type={data.type}>
        {label(data.ghost ? "missing" : data.type)}
      </Badge>
      <strong className="mt-2 block max-w-48.75 truncate text-xs font-[550] text-[#665771]">
        {data.title}
      </strong>
      {data.count > 0 && (
        <span
          className={cn(
            "absolute -top-1.75 -right-1.5 size-5.5 rounded-full border-2 border-white text-center text-[10px] leading-4.5",
            data.error
              ? "bg-[#c96b73] text-white"
              : "bg-[#fff5de] text-[#b3832e]",
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
const emptyFilters: GraphFilters = {};
export function KBGraph({
  kb,
  focus,
  depth = 1,
  filters = emptyFilters,
  onFocus,
  editable = true,
}: {
  kb: Snapshot;
  focus?: string;
  depth?: number | "all";
  filters?: GraphFilters;
  onFocus: (id: string) => void;
  editable?: boolean;
}) {
  const { data: schema } = useQuery(schemaQuery);
  const client = useQueryClient();
  const [connection, setConnection] = useState<Connection>();
  const [layout, setLayout] = useState<Record<string, NodeLayout>>({});
  const [flow, setFlow] = useState<ReactFlowInstance<GraphNode>>();
  const [create, setCreate] = useState<string>();
  const patch = useMutation({
    mutationFn: (kind: string) =>
      api(`/nodes/${encodeURIComponent(connection!.source!)}/edges`, {
        method: "PATCH",
        body: JSON.stringify({
          kind,
          targets: [
            ...new Set([
              ...kb.edges
                .filter(
                  (e) =>
                    e.from === connection!.source &&
                    e.kind === kind &&
                    e.source === "frontmatter",
                )
                .map((e) => e.to),
              connection!.target,
            ]),
          ],
        }),
      }),
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
          label: e.kind,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: bad ? "#c44242" : "#a6a2b1",
          },
          style: {
            stroke: bad ? "#c44242" : "#b2aebd",
            strokeDasharray: !known.has(e.to) ? "5 4" : undefined,
          },
          labelStyle: { fontSize: 10, fill: bad ? "#c44242" : "#757081" },
        };
      }),
    };
  }, [kb, focus, depth, filters]);
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
            nodesConnectable={editable}
            onConnect={editable ? setConnection : undefined}
            minZoom={0.15}
          >
            <Background gap={22} size={1} color="#dedbe5" />
            <Controls />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) =>
                n.data.type === "goal" ? "#8b78b5" : "#b4b9c3"
              }
            />
          </ReactFlow>
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-x-[20%] top-[45%] text-center text-xs text-[#978aa2]">
              No nodes match these filters. Try another depth or type.
            </div>
          )}
          {connection && (
            <Dialog
              open
              onOpenChange={() => setConnection(undefined)}
              title="Connect nodes"
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
                    disabled={patch.isPending}
                    onClick={() => patch.mutate(kind)}
                  >
                    {label(kind)}
                  </Button>
                ))
              ) : (
                <p>No valid relationship kinds for these node types.</p>
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
            <ContextMenuItem key={type} onSelect={() => setCreate(type)}>
              New {type} here…
            </ContextMenuItem>
          ),
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
