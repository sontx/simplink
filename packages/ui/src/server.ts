import {
  readFile,
  realpath,
  lstat,
  mkdir,
  writeFile,
  unlink,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  createKB,
  gitSource,
  deriveId,
  FOLDER_TO_TYPE,
  parseDoc,
  SCHEMA_DIR,
  type KB,
} from "@sontx/simplink-core";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { isNode, isSeq, parseDocument } from "yaml";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
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
export function createUiHandler(root: string): Express {
  let kb: KB;
  let rootPath: string;
  let schema: Record<string, Record<string, string>>;
  const remote = /^(?:https?|ssh|git|file):\/\/|^[^/\\\s]+@[^/\\:\s]+:/i.test(
    root,
  );
  const localRoot = remote
    ? path.join(
        homedir(),
        ".simplink",
        "repos",
        createHash("sha256").update(root).digest("hex"),
      )
    : root;
  const ready = Promise.all([
    createKB(remote ? gitSource(root, { checkout: localRoot }) : root),
    edgeSchema(),
  ]).then(async ([loaded, edges]) => {
    rootPath = await realpath(localRoot);
    kb = loaded;
    schema = edges;
    if (remote) console.log(`Git KB clone: ${rootPath}`);
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

  const query = (req: Request, key: string) => {
    const value = req.query[key];
    return typeof value === "string" ? value : undefined;
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

  async function reload(res: Response) {
    // shortcut: rebuild the full KB after writes, use incremental loading when KBs become large.
    kb = await createKB(rootPath);
    res.json({ status: kb.status, issues: kb.issues });
  }

  function docs(req: Request) {
    const layout = query(req, "layout") ?? "site";
    if (layout !== "site" && layout !== "graph")
      throw new HttpError(400, "Invalid docs layout");
    try {
      return kb.docs({ layout });
    } catch (error) {
      // Docs export rejects KB content (invalid or duplicate docs paths); show why instead of a 500.
      throw new HttpError(422, (error as Error).message);
    }
  }

  const app = express();
  app.disable("x-powered-by");

  app.use((req, _res, next) => {
    if (req.path.startsWith("/api/") || req.method !== "GET") {
      const port = req.socket.localPort;
      if (
        ![
          "127.0.0.1",
          "localhost",
          `127.0.0.1:${port}`,
          `localhost:${port}`,
        ].includes(req.headers.host ?? "")
      )
        throw new HttpError(403, "API requests require a local Host header");
    }
    if (
      req.method !== "GET" &&
      req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
        "application/json"
    )
      throw new HttpError(415, "Mutations require application/json");
    next();
  });

  // Serialize mutations so each write reloads the KB before the next one starts.
  app.use((req, res, next) => {
    if (req.method === "GET") return next();
    writes = writes.then(
      () =>
        new Promise<void>((resolve) => {
          res.on("close", resolve);
          next();
        }),
    );
  });

  app.use(express.json({ limit: "1mb" }), (req, _res, next) => {
    req.body ??= {};
    if (Array.isArray(req.body))
      throw new HttpError(400, "Expected a JSON object");
    next();
  });

  app.use(async (_req, _res, next) => {
    await ready;
    next();
  });

  app.get("/api/kb", (_req, res) => {
    res.json({
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
  });

  app.get("/api/schema", (_req, res) => {
    res.json(schema);
  });

  app.get("/api/search", async (req, res) => {
    res.json(await kb.search(query(req, "q") ?? ""));
  });

  app.get("/api/docs", (req, res) => {
    res.json(docs(req).map((page) => page.path));
  });

  app.get("/api/docs/page", (req, res) => {
    const page = docs(req).find((page) => page.path === query(req, "path"));
    if (!page) throw new HttpError(404, "Page not found");
    res.json(page);
  });

  app.get("/api/nodes/:id", async (req, res) => {
    const { id } = req.params;
    const node = kb.node(id);
    if (node) {
      res.json({
        node,
        out: kb.graph.out.get(id) ?? [],
        in: kb.graph.in.get(id) ?? [],
        raw: await readFile(await safeFile(node.path), "utf8"),
      });
      return;
    }
    // Invalid documents are missing from the graph, so read them from disk for repair.
    const [type, ...segments] = id.split(".");
    const folder = Object.keys(FOLDER_TO_TYPE).find(
      (key) => FOLDER_TO_TYPE[key] === type,
    );
    if (!folder || !segments.length) throw new HttpError(404, "Node not found");
    const relPath = `${folder}/${segments.join("/")}.md`;
    const raw = await readFile(await safeFile(relPath), "utf8");
    const parsed = parseDoc(relPath, raw);
    res.json({
      node: {
        id,
        type,
        path: relPath,
        title: typeof parsed.data.title === "string" ? parsed.data.title : id,
        summary:
          typeof parsed.data.summary === "string" ? parsed.data.summary : "",
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
  });

  app.get("/api/resolve/:id", async (req, res) => {
    const { id } = req.params;
    const node = kb.node(id);
    if (!node) throw new HttpError(404, "Node not found");
    if (node.type !== "goal" && node.type !== "procedure")
      throw new HttpError(400, "Only goals and procedures have plans");
    const resolved =
      node.type === "goal" ? kb.resolveGoal(id) : kb.resolveProcedure(id);
    res.json({ resolved, rendered: await kb.render(resolved) });
  });

  app.post("/api/reload", (_req, res) => reload(res));

  app
    .route("/api/files")
    .delete(async (req, res) => {
      await unlink(await safeFile(query(req, "path")));
      await reload(res);
    })
    .all(async (req, res) => {
      if (req.method !== "PUT" && req.method !== "POST")
        throw new HttpError(405, "Method not allowed");
      const file = await safeFile(req.body.path);
      if (typeof req.body.content !== "string")
        throw new HttpError(400, "Expected string content");
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, req.body.content, {
        flag: req.method === "POST" ? "wx" : "w",
      });
      await reload(res);
    });

  app.patch("/api/nodes/:id/edges", async (req, res) => {
    const node = kb.node(req.params.id);
    if (!node) throw new HttpError(404, "Node not found");
    const { kind, targets } = req.body;
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
      editEdges(await readFile(file, "utf8"), kind, targets),
    );
    await reload(res);
  });

  app.use("/api", () => {
    throw new HttpError(404, "Not found");
  });

  app.use((req, _res, next) => {
    if (decodeURIComponent(req.path).split(/[\\/]/).includes(".."))
      throw new HttpError(400, "Invalid asset path");
    next();
  });
  app.use(express.static(webRoot));
  app.get("/{*path}", (_req, res, next) =>
    res.sendFile(path.join(webRoot, "index.html"), (error) => {
      if (error) next(error);
    }),
  );
  app.use(() => {
    throw new HttpError(404, "Not found");
  });

  app.use(
    // Express recognizes error handlers by their four parameters.
    (error: unknown, _req: Request, res: Response, next: NextFunction) => {
      if (res.headersSent) {
        next(error);
        return;
      }
      const { code, status: known } = error as {
        code?: string;
        status?: number;
      };
      const status =
        typeof known === "number" && known < 500
          ? known
          : code === "ENOENT"
            ? 404
            : code === "EEXIST"
              ? 409
              : error instanceof URIError
                ? 400
                : 500;
      res.status(status).json({
        error:
          status === 500 ? "Internal server error" : (error as Error).message,
      });
    },
  );

  return app;
}
