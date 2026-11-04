import * as path from "./posix-path.js";
import type { DocPage } from "./docs.js";
import { en, type Messages } from "./i18n/index.js";
import type { KBGraph, KBNode } from "./types.js";

interface DocSettings {
  path?: string;
  order?: number;
}

function settings(node: KBNode): DocSettings {
  const value = node.data.docs;
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Invalid docs metadata for ${node.id}`);
  const docs = value as DocSettings;
  if (
    Object.keys(docs).some((key) => key !== "path" && key !== "order") ||
    (docs.order !== undefined &&
      (!Number.isInteger(docs.order) || docs.order < 0))
  )
    throw new Error(`Invalid docs metadata for ${node.id}`);
  if (
    docs.path !== undefined &&
    (typeof docs.path !== "string" ||
      !/^(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(
        docs.path,
      ) ||
      path.basename(docs.path) === "index.md")
  )
    throw new Error(`Invalid docs path for ${node.id}: ${docs.path}`);
  return docs;
}

/** Top-level reading order; titles come from the output language. */
const sectionOrder = [
  "getting-started",
  "guides",
  "reference",
  "troubleshooting",
];
const title = (folder: string, m: Messages) =>
  m.site.sections[folder] ??
  folder.replaceAll("-", " ").replace(/^./, (c) => c.toUpperCase());
const escapeLabel = (text: string) => text.replace(/[\\[\]]/g, "\\$&");

/** Project paths for publication; graph IDs and the loaded snapshot remain unchanged. */
export function siteGraph(graph: KBGraph): KBGraph {
  const paths = new Set<string>();
  const nodes = new Map(
    [...graph.nodes].map(([id, node]) => {
      if (node.type === "simp")
        return [id, { ...node, path: "index.md" }] as const;
      const docs = settings(node);
      const [, ...segments] = node.path.split("/");
      const filename = segments.pop()!;
      const section =
        node.type === "state"
          ? "troubleshooting"
          : node.type === "constraint"
            ? "reference"
            : "guides";
      const detail =
        node.type === "procedure"
          ? ["how-to"]
          : node.type === "capability"
            ? ["features"]
            : [];
      const destination =
        docs.path ??
        [
          section,
          ...segments,
          ...detail,
          filename === "index.md" ? "overview.md" : filename,
        ].join("/");
      if (paths.has(destination))
        throw new Error(`Duplicate docs path: ${destination}`);
      paths.add(destination);
      return [id, { ...node, path: destination }] as const;
    }),
  );
  return { ...graph, nodes };
}

/** Each directory has a landing page; children are ordered by explicit order, then task-first graph order. */
export function siteIndexes(
  graph: KBGraph,
  homepage?: DocPage,
  m: Messages = en,
): DocPage[] {
  const folders = new Set([""]);
  for (const node of graph.nodes.values()) {
    let folder = path.dirname(node.path);
    while (folder !== ".") {
      folders.add(folder);
      folder = path.dirname(folder);
    }
  }
  return [...folders].map((folder) => {
    const route = folder ? `${folder}/index.md` : "index.md";
    const home = !folder ? graph.nodes.get("simp") : undefined;
    const heading = folder
      ? title(path.basename(folder), m)
      : (home?.title ?? m.site.documentation);
    const summary = folder
      ? m.site.browse(heading)
      : (home?.summary ?? m.site.homeSummary);
    const entries: {
      path: string;
      title: string;
      /** Folder name for generated section entries; sorts independently of language. */
      section?: string;
      order: number;
      task: boolean;
    }[] = [];
    for (const child of folders) {
      if (
        !child ||
        (path.dirname(child) === "." ? "" : path.dirname(child)) !== folder
      )
        continue;
      const order = Math.min(
        ...[...graph.nodes.values()]
          .filter((n) => n.path.startsWith(child + "/"))
          .map((n) => settings(n).order ?? Infinity),
      );
      entries.push({
        path: `${child}/index.md`,
        title: title(path.basename(child), m),
        section: path.basename(child),
        order,
        task: false,
      });
    }
    for (const node of graph.nodes.values()) {
      if (
        node.type !== "simp" &&
        (path.dirname(node.path) === "." ? "" : path.dirname(node.path)) ===
          folder
      )
        entries.push({
          path: node.path,
          title: node.title,
          order: settings(node).order ?? Infinity,
          task: node.type === "goal",
        });
    }
    const rank = (section?: string) => {
      const index = section ? sectionOrder.indexOf(section) : -1;
      return index < 0 ? 99 : index;
    };
    entries.sort(
      (a, b) =>
        a.order - b.order ||
        Number(b.task) - Number(a.task) ||
        rank(a.section) - rank(b.section),
    );
    const links = entries
      .map(
        (e) =>
          `- [${escapeLabel(e.title)}](${path.relative(folder || ".", e.path)})`,
      )
      .join("\n");
    return {
      path: route,
      content:
        home && homepage
          ? homepage.content.trimEnd() + (links ? `\n\n${links}` : "") + "\n"
          : `---\ntitle: ${JSON.stringify(heading)}\ndescription: ${JSON.stringify(summary)}\n---\n\n# ${heading}\n\n${summary}${home?.body ? `\n\n${home.body.trim()}` : ""}${links ? `\n\n${links}` : ""}\n`,
    };
  });
}
