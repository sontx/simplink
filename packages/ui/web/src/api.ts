import { queryOptions } from "@tanstack/react-query";
import type {
  KBNode,
  KBEdge,
  Issue,
  KBStatus,
  SearchResult,
  RenderResult,
} from "@sontx/simplink-core";
export type NodeSummary = Pick<
  KBNode,
  "id" | "type" | "path" | "title" | "summary" | "status" | "tags"
>;

export interface Snapshot {
  status: KBStatus;
  issues: Issue[];
  nodes: NodeSummary[];
  edges: KBEdge[];
}

export interface NodeDetail {
  node: KBNode;
  out: KBEdge[];
  in: KBEdge[];
  raw: string;
}

export type Schema = Record<string, Record<string, string>>;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error ?? value.message ?? response.statusText);
  return value as T;
}

export const kbQuery = queryOptions({
  queryKey: ["kb"],
  queryFn: () => api<Snapshot>("/kb"),
});

export const schemaQuery = queryOptions({
  queryKey: ["schema"],
  queryFn: () => api<Schema>("/schema"),
});

export const nodeQuery = (id: string) =>
  queryOptions({
    queryKey: ["node", id],
    queryFn: () => api<NodeDetail>(`/nodes/${encodeURIComponent(id)}`),
  });

export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: ["search", q],
    queryFn: () => api<SearchResult>(`/search?q=${encodeURIComponent(q)}`),
    enabled: !!q,
  });

export const docsQuery = (layout: string) =>
  queryOptions({
    queryKey: ["docs", layout],
    queryFn: () => api<string[]>(`/docs?layout=${layout}`),
  });

export const pageQuery = (layout: string, path: string) =>
  queryOptions({
    queryKey: ["page", layout, path],
    queryFn: () =>
      api<{ path: string; content: string }>(
        `/docs/page?layout=${layout}&path=${encodeURIComponent(path)}`,
      ),
    enabled: !!path,
  });

export const planQuery = (id: string) =>
  queryOptions({
    queryKey: ["plan", id],
    queryFn: () =>
      api<{ rendered: RenderResult }>(`/resolve/${encodeURIComponent(id)}`),
  });
