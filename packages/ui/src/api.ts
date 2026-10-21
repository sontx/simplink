import type { WorkspaceService } from "./workspace/service.js";
import { queryOptions } from "@tanstack/react-query";
import type { KBNode, KBEdge, Issue, KBStatus } from "@sontx/simplink-core";
export type NodeSummary = Pick<
  KBNode,
  "id" | "type" | "path" | "title" | "summary" | "status" | "tags"
>;

export interface Snapshot {
  status: KBStatus;
  issues: Issue[];
  nodes: NodeSummary[];
  edges: KBEdge[];
  stale: boolean;
}

export interface NodeDetail {
  node: KBNode;
  out: KBEdge[];
  in: KBEdge[];
  raw: string;
}

export type Schema = Record<string, Record<string, string>>;

export const kbQuery = (service: WorkspaceService) =>
  queryOptions({ queryKey: ["kb"], queryFn: () => service.snapshot() });

export const schemaQuery = (service: WorkspaceService) =>
  queryOptions({ queryKey: ["schema"], queryFn: () => service.schema() });

export const nodeQuery = (service: WorkspaceService, id: string) =>
  queryOptions({
    queryKey: ["node", id],
    queryFn: () => service.nodeDetail(id),
  });

export const searchQuery = (service: WorkspaceService, q: string) =>
  queryOptions({
    queryKey: ["search", q],
    queryFn: () => service.search(q),
    enabled: !!q,
  });

export const docsQuery = (service: WorkspaceService, layout: string) =>
  queryOptions({
    queryKey: ["docs", layout],
    queryFn: () => service.docs(layout),
  });

export const pageQuery = (
  service: WorkspaceService,
  layout: string,
  path: string,
) =>
  queryOptions({
    queryKey: ["page", layout, path],
    queryFn: () => service.page(layout, path),
    enabled: !!path,
  });

export const planQuery = (service: WorkspaceService, id: string) =>
  queryOptions({ queryKey: ["plan", id], queryFn: () => service.resolve(id) });
