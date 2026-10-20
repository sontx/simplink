import {
  readFile,
  realpath,
  lstat,
  mkdir,
  writeFile,
  unlink,
  readdir,
} from "node:fs/promises";
import type {
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createKB,
  deriveId,
  FOLDER_TO_TYPE,
  parseDoc,
  SCHEMA_DIR,
  type KB,
} from "@sontx/simplink-core";
import { isNode, isSeq, parseDocument } from "yaml";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res
    .writeHead(status, { "content-type": "application/json" })
    .end(JSON.stringify(body));
};

async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 1024 * 1024)
      throw new HttpError(413, "Request body exceeds 1 MB");
    chunks.push(Buffer.from(chunk));
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Expected a JSON object");
  }
}

async function edgeSchema(): Promise<Record<string, Record<string, string>>> {
  const schema: Record<string, Record<string, string>> = {};
  const defs = JSON.parse(
    await readFile(path.join(SCHEMA_DIR, "defs.schema.json"), "utf8"),
  );
  for (const file of await readdir(SCHEMA_DIR)) {
    if (file === "defs.schema.json" || !file.endsWith(".schema.json")) continue;
    const definition = JSON.parse(
      await readFile(path.join(SCHEMA_DIR, file), "utf8"),
    );
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries({
      ...defs.$defs.common.properties,
      ...definition.properties,
    })) {
      const ref = (value as { $ref?: string }).$ref;
      const target = ref?.match(
        /^(?:defs\.schema\.json)?#\/\$defs\/(\w+)Refs$/,
      )?.[1];
      if (target) fields[key] = target;
    }
    schema[file.replace(".schema.json", "")] = fields;
  }
  return schema;
}

function editEdges(raw: string, kind: string, targets: string[]): string {
  const block = /^(---\r?\n)([\s\S]*?)(^---[^\S\r\n]*(?:\r?\n|$))/m.exec(raw);
  if (!block || block.index !== 0)
    throw new HttpError(400, "Missing frontmatter");
  const doc = parseDocument(block[2]);
  if (doc.errors.length) throw new HttpError(400, "Invalid frontmatter");
  const previous = doc.get(kind, true);
  const replacement = doc.createNode(targets);
  if (isSeq(previous)) replacement.flow = previous.flow;
  doc.setIn([kind], replacement);
  // Patch only the selected YAML value; unrelated frontmatter and the body keep their bytes.
  let yaml: string;
  if (isNode(previous) && previous.range) {
    const rendered = doc.toString();
    const updated = parseDocument(rendered).get(kind, true);
    if (!isNode(updated) || !updated.range)
      throw new HttpError(400, "Invalid relationship field");
    const originalValue = block[2].slice(previous.range[0], previous.range[1]);
    const newline = block[1].includes("\r\n") ? "\r\n" : "\n";
    let value = rendered
      .slice(updated.range[0], updated.range[1])
      .replace(/\r?\n/g, newline);
    if (originalValue.endsWith("\n") && !value.endsWith("\n")) value += newline;
    yaml =
      block[2].slice(0, previous.range[0]) +
      value +
      block[2].slice(previous.range[1]);
  } else {
    const added = parseDocument(`${kind}: []\n`);
    added.setIn([kind], replacement);
    yaml =
      block[2] +
      added
        .toString()
        .replace(/\n/g, block[1].includes("\r\n") ? "\r\n" : "\n");
  }
  return block[1] + yaml + raw.slice(block[1].length + block[2].length);
}

/** Local authoring API and bundled SPA. Reload the snapshot after each write. */
export function createUiHandler(root: string): RequestListener {
  let kb: KB;
  let rootPath: string;
  let schema: Record<string, Record<string, string>>;
  const ready = Promise.all([
    realpath(root),
    createKB(root),
    edgeSchema(),
  ]).then(([directory, loaded, edges]) => {
    rootPath = directory;
    kb = loaded;
    schema = edges;
  });
  // Initialization errors are reported by requests, including when startup completes before a client connects.
  void ready.catch(() => {});
  let writes = Promise.resolve();
  const webRoot = fileURLToPath(new URL("../web/", import.meta.url));

  const inside = (base: string, target: string) => {
    const relative = path.relative(base, target);
    return (
      relative === "" ||
      (!relative.startsWith(".." + path.sep) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    );
  };

  async function safeFile(value: unknown): Promise<string> {
    if (
      typeof value !== "string" ||
      !value.endsWith(".md") ||
      value.includes("\\") ||
      !deriveId(value).derivedId
    )
      throw new HttpError(
        400,
        "Expected a Markdown path under a node type folder",
      );
    const target = path.resolve(rootPath, value);
    if (!inside(rootPath, target))
      throw new HttpError(400, "Path escapes KB root");
    let ancestor = target;
    while (true) {
      try {
        if (!inside(rootPath, await realpath(ancestor)))
          throw new HttpError(400, "Path escapes KB root");
        return target;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        try {
          if ((await lstat(ancestor)).isSymbolicLink())
            throw new HttpError(400, "Unresolved symbolic link");
        } catch (linkError) {
          if ((linkError as NodeJS.ErrnoException).code !== "ENOENT")
            throw linkError;
        }
        const parent = path.dirname(ancestor);
        if (parent === ancestor) throw error;
        ancestor = parent;
      }
    }
  }

  async function reload(res: ServerResponse) {
    // shortcut: rebuild the full KB after writes, use incremental loading when KBs become large.
    kb = await createKB(rootPath);
    sendJson(res, 200, { status: kb.status, issues: kb.issues });
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL) {
    await ready;
    const route = url.pathname;
    if (req.method === "GET") {
      if (route === "/api/kb")
        return sendJson(res, 200, {
          status: kb.status,
          issues: kb.issues,
          nodes: [...kb.graph.nodes.values()].map(
            ({ id, type, path, title, summary, status, tags }) => ({
              id,
              type,
              path,
              title,
              summary,
              status,
              tags,
            }),
          ),
          edges: kb.graph.edges,
        });
      if (route === "/api/schema") return sendJson(res, 200, schema);
      if (route === "/api/search")
        return sendJson(
          res,
          200,
          await kb.search(url.searchParams.get("q") ?? ""),
        );
      if (route === "/api/docs" || route === "/api/docs/page") {
        const layout = url.searchParams.get("layout") ?? "site";
        if (layout !== "site" && layout !== "graph")
          throw new HttpError(400, "Invalid docs layout");
        const pages = kb.docs({ layout });
        if (route === "/api/docs")
          return sendJson(
            res,
            200,
            pages.map((page) => page.path),
          );
        const page = pages.find(
          (page) => page.path === url.searchParams.get("path"),
        );
        if (!page) throw new HttpError(404, "Page not found");
        return sendJson(res, 200, page);
      }
      const nodeRoute = /^\/api\/(nodes|resolve)\/([^/]+)$/.exec(route);
      if (nodeRoute) {
        const id = decodeURIComponent(nodeRoute[2]);
        const node = kb.node(id);
        if (!node && nodeRoute[1] === "nodes") {
          const [type, ...segments] = id.split(".");
          const folder = Object.keys(FOLDER_TO_TYPE).find(
            (key) => FOLDER_TO_TYPE[key] === type,
          );
          if (!folder || !segments.length)
            throw new HttpError(404, "Node not found");
          const relPath = `${folder}/${segments.join("/")}.md`;
          const raw = await readFile(await safeFile(relPath), "utf8");
          const parsed = parseDoc(relPath, raw);
          return sendJson(res, 200, {
            node: {
              id,
              type,
              path: relPath,
              title:
                typeof parsed.data.title === "string" ? parsed.data.title : id,
              summary:
                typeof parsed.data.summary === "string"
                  ? parsed.data.summary
                  : "",
              tags: [],
              aliases: [],
              status: "active",
              data: parsed.data,
              body: parsed.body,
            },
            out: [],
            in: [],
            raw,
          });
        }
        if (!node) throw new HttpError(404, "Node not found");
        if (nodeRoute[1] === "nodes")
          return sendJson(res, 200, {
            node,
            out: kb.graph.out.get(id) ?? [],
            in: kb.graph.in.get(id) ?? [],
            raw: await readFile(await safeFile(node.path), "utf8"),
          });
        if (node.type !== "goal" && node.type !== "procedure")
          throw new HttpError(400, "Only goals and procedures have plans");
        const resolved =
          node.type === "goal" ? kb.resolveGoal(id) : kb.resolveProcedure(id);
        return sendJson(res, 200, {
          resolved,
          rendered: await kb.render(resolved),
        });
      }
      if (route.startsWith("/api/")) throw new HttpError(404, "Not found");
      const target = path.resolve(webRoot, "." + decodeURIComponent(route));
      if (!inside(webRoot, target))
        throw new HttpError(400, "Invalid asset path");
      let asset = target;
      let content: Buffer;
      try {
        content = await readFile(asset);
      } catch (error) {
        if (
          !["ENOENT", "EISDIR"].includes(
            (error as NodeJS.ErrnoException).code ?? "",
          )
        )
          throw error;
        asset = path.join(webRoot, "index.html");
        content = await readFile(asset);
      }
      const types: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon",
        ".woff2": "font/woff2",
        ".json": "application/json",
      };
      res
        .writeHead(200, {
          "content-type":
            types[path.extname(asset)] ?? "application/octet-stream",
        })
        .end(content);
      return;
    }
    const body = await readJson(req);
    if (route === "/api/reload" && req.method === "POST") return reload(res);
    if (route === "/api/files") {
      const file = await safeFile(
        req.method === "DELETE" ? url.searchParams.get("path") : body.path,
      );
      if (req.method === "DELETE") await unlink(file);
      else if (req.method === "PUT" || req.method === "POST") {
        if (typeof body.content !== "string")
          throw new HttpError(400, "Expected string content");
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, body.content, {
          flag: req.method === "POST" ? "wx" : "w",
        });
      } else throw new HttpError(405, "Method not allowed");
      return reload(res);
    }
    const edgeRoute = /^\/api\/nodes\/([^/]+)\/edges$/.exec(route);
    if (edgeRoute && req.method === "PATCH") {
      const node = kb.node(decodeURIComponent(edgeRoute[1]));
      if (!node) throw new HttpError(404, "Node not found");
      const { kind, targets } = body;
      const targetType =
        typeof kind === "string" && Object.hasOwn(schema[node.type], kind)
          ? schema[node.type][kind]
          : undefined;
      if (
        !targetType ||
        !Array.isArray(targets) ||
        new Set(targets).size !== targets.length ||
        !targets.every(
          (target) =>
            typeof target === "string" &&
            !!kb.node(target) &&
            (targetType === "node" || kb.node(target)?.type === targetType),
        )
      )
        throw new HttpError(400, "Invalid relationship kind or targets");
      const file = await safeFile(node.path);
      await writeFile(
        file,
        editEdges(await readFile(file, "utf8"), kind as string, targets),
      );
      return reload(res);
    }
    throw new HttpError(404, "Not found");
  }

  return (req, res) => {
    const run = async () => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname.startsWith("/api/") || req.method !== "GET") {
          const port = req.socket.localPort;
          if (
            ![
              "127.0.0.1",
              "localhost",
              `127.0.0.1:${port}`,
              `localhost:${port}`,
            ].includes(req.headers.host ?? "")
          )
            throw new HttpError(
              403,
              "API requests require a local Host header",
            );
        }
        if (req.method !== "GET") {
          if (
            req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
            "application/json"
          )
            throw new HttpError(415, "Mutations require application/json");
        }
        await handle(req, res, url);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        const status =
          error instanceof HttpError
            ? error.status
            : code === "ENOENT"
              ? 404
              : code === "EEXIST"
                ? 409
                : error instanceof URIError
                  ? 400
                  : 500;
        sendJson(res, status, {
          error:
            status === 500 ? "Internal server error" : (error as Error).message,
        });
      }
    };
    if (req.method === "GET") void run();
    else writes = writes.then(run, run);
  };
}
