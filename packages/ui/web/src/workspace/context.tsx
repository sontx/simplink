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
  type DirectoryHandle,
  type KBStore,
} from "./store.js";
import { lastDirectory, rememberDirectory } from "./persist.js";
import { Button, ErrorMessage, Page } from "../components/ui/primitives.js";

interface Workspace {
  id: number;
  service: WorkspaceService;
  client: QueryClient;
  close(): void;
  openAnother(): void;
  reload(): Promise<unknown>;
  setDraftDirty(dirty: boolean): void;
}

const Context = createContext<Workspace | null>(null);
let nextId = 0;

export function useWorkspace(): Workspace {
  const workspace = useContext(Context);
  if (!workspace) throw new Error("Open a KB folder first");
  return workspace;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const opening = useRef(false);
  const active = useRef<Workspace | null>(null);
  const [last, setLast] = useState<DirectoryHandle | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void lastDirectory().then(setLast);
  }, []);
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
    if (
      !wasDirty &&
      active.current?.service.store.dirty &&
      !window.confirm(
        "Changes were saved in memory while opening the folder. Download them before leaving to keep them. Continue?",
      )
    ) {
      service.close();
      return;
    }
    active.current?.service.close();
    active.current?.client.clear();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, refetchOnWindowFocus: false },
      },
    });
    let draftDirty = false;
    const canLeave = () =>
      (!draftDirty && !service.store.dirty) ||
      window.confirm(
        draftDirty
          ? "Discard unsaved changes in the editor? Download any saved memory edits before leaving."
          : "Changes are saved in memory. Download the KB before leaving to keep them. Continue?",
      );
    const next: Workspace = {
      id: ++nextId,
      service,
      client,
      setDraftDirty(dirty) {
        draftDirty = dirty;
      },
      close() {
        if (!opening.current && canLeave()) {
          service.close();
          client.clear();
          active.current = null;
          setWorkspace(null);
        }
      },
      openAnother() {
        if (!opening.current && canLeave()) void open();
      },
      async reload() {
        if (
          service.store.dirty &&
          !window.confirm(
            "Reload rereads this memory workspace and keeps your edits. Continue?",
          )
        )
          return;
        return service.reload();
      },
    };
    active.current = next;
    setWorkspace(next);
    if (handle && (await rememberDirectory(handle))) setLast(handle);
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
      else setMessage("Folder selection cancelled.");
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
          "Open this page over HTTPS or localhost to access folders.",
        );
      if ((await last.requestPermission({ mode: "readwrite" })) !== "granted")
        throw new Error(
          "Folder permission denied. Open the folder again to grant access.",
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
          {busy && (
            <p
              role="status"
              className="fixed inset-x-0 bottom-0 bg-card p-3 text-center"
            >
              Opening folder…
            </p>
          )}
          {message && <p role="status">{message}</p>}
          <ErrorMessage error={error} />
        </QueryClientProvider>
      </Context.Provider>
    );
  return (
    <Page className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4">
      <h1 className="text-2xl font-semibold">Open a knowledge base</h1>
      <p>
        Choose a local KB folder. Dot-files and dot-folders such as .git are
        excluded. Git URLs are not supported.
      </p>
      <p>
        Chromium browsers save directly to your folder. Other browsers keep
        changes in memory; download a zip to keep them.
      </p>
      {!window.isSecureContext && (
        <p role="alert">Folder access requires HTTPS or localhost.</p>
      )}
      <Button
        disabled={busy || !window.isSecureContext}
        onClick={() => void open()}
      >
        Open KB folder
      </Button>
      {last && (
        <Button
          disabled={busy || !window.isSecureContext}
          onClick={() => void reopen()}
        >
          Reopen {last.name}
        </Button>
      )}
      {message && <p role="status">{message}</p>}
      <ErrorMessage error={error} />
    </Page>
  );
}
