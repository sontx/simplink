import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceService } from "./service.js";
import {
  directoryStore,
  pickFolder,
  remoteStore,
  UnreachableNodeError,
  type DirectoryHandle,
  type KBStore,
} from "./store.js";
import { lastDirectory, rememberDirectory } from "./persist.js";
import { Button, ErrorMessage } from "../components/ui/primitives.js";
import { useConfirm } from "../components/confirm.js";
import { downloadBlob } from "../lib/utils.js";
import { Input } from "../components/ui/input.js";
import { usePreferences } from "../components/preferences.js";
import { SimpNetwork } from "../components/simp-network.js";
import {
  FolderOpen,
  Globe,
  HardDrive,
  History,
  Info,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";

interface Workspace {
  id: number;
  service: WorkspaceService;
  client: QueryClient;
  close(): Promise<void>;
  openAnother(): Promise<void>;
  reload(): Promise<unknown>;
  setDraftDirty(dirty: boolean): void;
}

const Context = createContext<Workspace | null>(null);
let nextId = 0;

// Session storage survives a page refresh but not closing the tab, so the token never outlives the tab.
const REMOTE_SESSION = "simplink-remote-session";
const CLOSED_SESSION = "simplink-workspace-closed";

function workspaceClosed(): boolean {
  try {
    return sessionStorage.getItem(CLOSED_SESSION) === "true";
  } catch {
    return false;
  }
}

function saveWorkspaceClosed(closed: boolean) {
  try {
    if (closed) sessionStorage.setItem(CLOSED_SESSION, "true");
    else sessionStorage.removeItem(CLOSED_SESSION);
  } catch {
    /* Closing still works when browser storage is unavailable. */
  }
}

interface RemoteSession {
  url: string;
  token: string;
}

function saveRemoteSession(session?: RemoteSession) {
  try {
    if (session)
      sessionStorage.setItem(REMOTE_SESSION, JSON.stringify(session));
    else sessionStorage.removeItem(REMOTE_SESSION);
  } catch {
    /* Restoring after a refresh is optional. */
  }
}

function remoteSession(): RemoteSession | null {
  try {
    return JSON.parse(
      sessionStorage.getItem(REMOTE_SESSION) ?? "null",
    ) as RemoteSession | null;
  } catch {
    return null;
  }
}

/** Saves a memory workspace as `<name>.zip`, the only way to keep its edits. */
export async function downloadZip(service: WorkspaceService): Promise<void> {
  downloadBlob(
    new Blob([new Uint8Array(await service.exportZip())], {
      type: "application/zip",
    }),
    `${service.store.name}.zip`,
  );
}

export function useWorkspace(): Workspace {
  const workspace = useContext(Context);
  if (!workspace) throw new Error("Open a KB folder first");
  return workspace;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const opening = useRef(false);
  const active = useRef<Workspace | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const [last, setLast] = useState<DirectoryHandle | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(true);
  const [nodeUrl, setNodeUrl] = useState(() => {
    try {
      return localStorage.getItem("simplink-node-url") ?? "";
    } catch {
      return "";
    }
  });
  const [token, setToken] = useState(() => remoteSession()?.token ?? "");
  const { t } = usePreferences();
  const confirm = useConfirm();
  // Memory edits exist only in this tab, so leaving offers to download them first.
  const keepOffer = (service: WorkspaceService) =>
    service.store.kind === "memory" && service.store.dirty
      ? { download: () => downloadZip(service) }
      : {};
  useEffect(() => {
    let cancelled = false;
    opening.current = true;
    void (async () => {
      try {
        const remote = remoteSession();
        if (remote && !workspaceClosed()) {
          if (await activate(await remoteStore(remote.url, remote.token)))
            saveRemoteSession(remote);
          return;
        }
        const handle = await lastDirectory();
        if (cancelled) return;
        setLast(handle);
        if (
          handle &&
          !workspaceClosed() &&
          window.isSecureContext &&
          (await handle.queryPermission({ mode: "readwrite" })) === "granted" &&
          !cancelled
        )
          await activate(directoryStore(handle), handle);
      } catch (error) {
        if (!cancelled) setError(error);
      } finally {
        if (!cancelled) {
          opening.current = false;
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // Status notes are transient; errors stay until dismissed or replaced.
  useEffect(() => {
    if (!message || !workspace) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message, workspace]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (workspace?.service.store.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [workspace]);

  async function activate(
    store: KBStore,
    handle?: DirectoryHandle,
    wasDirty = false,
  ) {
    const service = await WorkspaceService.open(store);
    const previous = active.current?.service;
    if (
      !wasDirty &&
      previous?.store.dirty &&
      !(await confirm({
        title: t("Leave without downloading?"),
        description: t(
          "Changes were saved in memory while the folder was opening. Download them as a .zip to keep them.",
        ),
        confirmLabel: t("Leave without downloading"),
        destructive: true,
        ...keepOffer(previous),
      }))
    ) {
      service.close();
      return false;
    }
    active.current?.service.close();
    active.current?.client.clear();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, refetchOnWindowFocus: false },
      },
    });
    let draftDirty = false;
    const canLeave = async () =>
      (!draftDirty && !service.store.dirty) ||
      (await confirm(
        draftDirty
          ? {
              title: t("Discard unsaved changes?"),
              description: service.store.dirty
                ? t(
                    "The editor has changes that aren't saved. Saved memory edits are kept only if you download them.",
                  )
                : t("The editor has changes that aren't saved."),
              confirmLabel: t("Discard and leave"),
              destructive: true,
              ...keepOffer(service),
            }
          : {
              title: t("Leave without downloading?"),
              description: t(
                "Your changes live only in this browser tab. Download the KB as a .zip to keep them.",
              ),
              confirmLabel: t("Leave without downloading"),
              destructive: true,
              ...keepOffer(service),
            },
      ));
    const next: Workspace = {
      id: ++nextId,
      service,
      client,
      setDraftDirty(dirty) {
        draftDirty = dirty;
      },
      async close() {
        if (opening.current || !(await canLeave())) return;
        service.close();
        client.clear();
        active.current = null;
        setWorkspace(null);
        saveRemoteSession();
        saveWorkspaceClosed(true);
      },
      async openAnother() {
        if (!opening.current && (await canLeave())) await open();
      },
      async reload() {
        if (
          service.store.dirty &&
          !(await confirm({
            title: t("Reload this workspace?"),
            description: t(
              "Reload rereads this memory workspace and keeps your edits.",
            ),
            confirmLabel: t("Reload"),
          }))
        )
          return;
        return service.reload();
      },
    };
    active.current = next;
    setWorkspace(next);
    saveWorkspaceClosed(false);
    saveRemoteSession();
    if (handle && (await rememberDirectory(handle))) setLast(handle);
    return true;
  }

  async function open() {
    if (opening.current) return;
    opening.current = true;
    const wasDirty = !!active.current?.service.store.dirty;
    setBusy(true);
    setError(undefined);
    setMessage("");
    try {
      const picked = await pickFolder();
      if (picked) await activate(picked.store, picked.handle, wasDirty);
      else setMessage(t("Folder selection cancelled."));
    } catch (error) {
      setError(error);
    } finally {
      opening.current = false;
      setBusy(false);
    }
  }

  // The URL is remembered across visits; the token only for this tab, so a refresh reconnects.
  async function connect() {
    if (opening.current || !nodeUrl.trim()) return;
    opening.current = true;
    const wasDirty = !!active.current?.service.store.dirty;
    setBusy(true);
    setError(undefined);
    setMessage("");
    try {
      if (
        await activate(await remoteStore(nodeUrl, token), undefined, wasDirty)
      )
        saveRemoteSession({ url: nodeUrl.trim(), token });
      try {
        localStorage.setItem("simplink-node-url", nodeUrl.trim());
      } catch {
        /* Remembering the URL is optional. */
      }
    } catch (error) {
      setError(error);
    } finally {
      opening.current = false;
      setBusy(false);
    }
  }

  async function reopen() {
    if (!last || opening.current) return;
    opening.current = true;
    setBusy(true);
    setError(undefined);
    setMessage("");
    try {
      if (!window.isSecureContext)
        throw new Error(
          t("Open this page over HTTPS or localhost to access folders."),
        );
      if ((await last.requestPermission({ mode: "readwrite" })) !== "granted")
        throw new Error(
          t("Folder permission denied. Open the folder again to grant access."),
        );
      await activate(directoryStore(last), last);
    } catch (error) {
      setError(error);
    } finally {
      opening.current = false;
      setBusy(false);
    }
  }
  // The router mounts only after loading; every folder owns a separate query cache.
  if (workspace)
    return (
      <Context.Provider value={workspace}>
        <QueryClientProvider key={workspace.id} client={workspace.client}>
          <div className="contents" inert={busy} aria-busy={busy}>
            {children}
          </div>
          {(busy || message || !!error) && (
            <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex flex-col items-center gap-2 px-4">
              {busy && (
                <p
                  role="status"
                  className="flex items-center gap-2 rounded-lg border bg-popover px-3.5 py-2 text-sm text-popover-foreground shadow-md"
                >
                  <LoaderCircle className="size-4 animate-spin text-primary motion-reduce:animate-none" />
                  {t("Opening folder…")}
                </p>
              )}
              {!busy && message && (
                <p
                  role="status"
                  className="pointer-events-auto flex items-center gap-3 rounded-lg border bg-popover py-1.5 pr-1.5 pl-3.5 text-sm text-muted-foreground shadow-md"
                >
                  {message}
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setMessage("")}
                  >
                    {t("Dismiss")}
                  </Button>
                </p>
              )}
              {!busy && error ? (
                <div className="pointer-events-auto w-full max-w-lg rounded-lg bg-popover shadow-md">
                  <ErrorMessage
                    error={error}
                    onDismiss={() => setError(undefined)}
                  />
                </div>
              ) : null}
            </div>
          )}
        </QueryClientProvider>
      </Context.Provider>
    );
  if (busy)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-muted/40">
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin text-primary motion-reduce:animate-none" />
          {t("Opening folder…")}
        </p>
      </main>
    );
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <SimpNetwork avoid={content} />
      <div ref={content} className="relative w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.25 text-[23px] font-bold tracking-[-1px]">
          <img
            src={`${import.meta.env.BASE_URL}logo.svg`}
            alt=""
            width={26}
            height={26}
          />
          <span>
            <span className="text-primary">simp</span>link
          </span>
        </div>
        <section className="rounded-xl border bg-card p-8 shadow-sm max-[480px]:p-5">
          <h1 className="text-xl font-semibold tracking-tight">
            {t("Open a knowledge base")}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t(
              "Open a local folder of Markdown nodes to explore and edit, or connect to a simp node to browse it read-only.",
            )}
          </p>
          {!window.isSecureContext && (
            <p
              role="alert"
              className="mt-5 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            >
              <ShieldAlert className="size-4 shrink-0" />
              {t("Folder access requires HTTPS or localhost.")}
            </p>
          )}
          <Button
            size="lg"
            className="mt-6 w-full"
            disabled={busy || !window.isSecureContext}
            onClick={() => void open()}
          >
            <FolderOpen />
            {t("Open KB folder")}
          </Button>
          <form
            className="mt-6 space-y-2 border-t pt-6"
            onSubmit={(event) => {
              event.preventDefault();
              void connect();
            }}
          >
            <div className="text-xs font-medium text-muted-foreground">
              {t("Or connect to a simp node")}
            </div>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">
                {t("Simp node URL")}
              </span>
              <Input
                type="url"
                required
                placeholder="http://localhost:3393"
                value={nodeUrl}
                onChange={(event) => setNodeUrl(event.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">
                {t("Token (optional)")}
              </span>
              <Input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
            <Button
              type="submit"
              variant="outline"
              className="w-full"
              disabled={busy}
            >
              <Globe />
              {t("Connect")}
            </Button>
          </form>
          {last && (
            <div className="mt-6">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                {t("Recent")}
              </div>
              <button
                type="button"
                aria-label={t("Reopen {name}", { name: last.name })}
                disabled={busy || !window.isSecureContext}
                onClick={() => void reopen()}
                className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              >
                <History className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {last.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("Reopen")}
                </span>
              </button>
            </div>
          )}
          {message && (
            <p role="status" className="mt-4 text-sm text-muted-foreground">
              {message}
            </p>
          )}
          {error ? (
            <div className="mt-4">
              <ErrorMessage
                error={
                  error instanceof UnreachableNodeError
                    ? t(
                        "Cannot reach {url}. Check the URL and that the node allows this page's origin (--allowed-origin {origin}).",
                        { url: error.url, origin: error.origin },
                      )
                    : error
                }
              />
            </div>
          ) : null}
        </section>
        <ul className="mt-6 space-y-2 px-1 text-xs text-muted-foreground">
          <li className="flex gap-2">
            <HardDrive className="mt-px size-3.5 shrink-0" />
            {t(
              "Chromium browsers save directly to your folder. Other browsers keep changes in memory; download a zip to keep them.",
            )}
          </li>
          <li className="flex gap-2">
            <Globe className="mt-px size-3.5 shrink-0" />
            {t(
              "Simp nodes open read-only. Add this page's origin to the node's allowed origins.",
            )}
          </li>
          <li className="flex gap-2">
            <Info className="mt-px size-3.5 shrink-0" />
            {t(
              "Dot-files and dot-folders such as .git are excluded. Git URLs are not supported.",
            )}
          </li>
        </ul>
      </div>
    </main>
  );
}
