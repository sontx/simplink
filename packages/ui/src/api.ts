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
  /** Path of the file this session last wrote. */
  lastEdited?: string;
  /** Memory stores: files changed since the last download. */
  changed?: number;
  /** The last deleted file, while it can still be restored. */
  deleted?: { path: string; id?: string; title: string };
}

export interface NodeDetail {
  node: KBNode;
  out: KBEdge[];
  in: KBEdge[];
  raw: string;
  /** The node's entry in `simp-sources.yaml`, when the workspace has one. */
  sources?: string[];
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

export const docsQuery = (
  service: WorkspaceService,
  layout: string,
  language: string,
) =>
  queryOptions({
    queryKey: ["docs", layout, language],
    queryFn: () => service.docs(layout, language),
  });

export const pageQuery = (
  service: WorkspaceService,
  layout: string,
  path: string,
  language: string,
) =>
  queryOptions({
    queryKey: ["page", layout, path, language],
    queryFn: () => service.page(layout, path, language),
    enabled: !!path,
  });

export const planQuery = (
  service: WorkspaceService,
  id: string,
  language: string,
) =>
  queryOptions({
    queryKey: ["plan", id, language],
    queryFn: () => service.resolve(id, language),
  });
