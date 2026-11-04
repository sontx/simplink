import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Download, Save } from "lucide-react";
import { usePreferences } from "./preferences.js";
import { Button, ErrorMessage } from "./ui/primitives.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.js";

export interface ConfirmOptions {
  /** Translated question, e.g. "Leave without downloading?". */
  title: string;
  /** Translated consequence text. */
  description?: ReactNode;
  /** Translated label for the confirming action; it names what happens. */
  confirmLabel: string;
  /** Translated label for staying put; defaults to "Cancel". */
  cancelLabel?: string;
  /** Staying put is the recommended choice: Cancel takes the primary style. */
  safeFirst?: boolean;
  destructive?: boolean;
  /** Memory mode: offers "Download .zip and leave", which confirms once the download succeeds. */
  download?: () => Promise<void>;
  /** An unsaved draft: offers "Save and leave", which confirms once the save succeeds. */
  save?: () => Promise<void>;
}

/**
 * The one confirmation dialog. Cancel holds focus on open, so Enter and Escape
 * both keep the author where they are.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  safeFirst = false,
  destructive = false,
  pending = false,
  error,
  onConfirm,
  onCancel,
  download,
  save,
  children,
}: ConfirmOptions & {
  open: boolean;
  pending?: boolean;
  error?: unknown;
  onConfirm(): void;
  onCancel(): void;
  children?: ReactNode;
}) {
  const { t } = usePreferences();
  const cancel = useRef<HTMLButtonElement>(null);
  const [working, setWorking] = useState<"download" | "save">();
  const [downloadError, setDownloadError] = useState<unknown>();
  const busy = pending || !!working;
  // Keeps the author's work first, then confirms; a failure keeps them here.
  async function keepAndLeave(kind: "download" | "save") {
    const keep = kind === "download" ? download : save;
    if (!keep) return;
    setWorking(kind);
    setDownloadError(undefined);
    try {
      await keep();
      onConfirm();
    } catch (failure) {
      setDownloadError(failure);
    } finally {
      setWorking(undefined);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          setDownloadError(undefined);
          onCancel();
        }
      }}
    >
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        className="gap-5 p-5 sm:max-w-xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
      >
        <DialogHeader className="gap-1.5">
          <DialogTitle className="text-base leading-snug font-semibold text-pretty">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="leading-relaxed text-pretty wrap-anywhere">
              {description}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        {children}
        <ErrorMessage error={downloadError ?? error} />
        <DialogFooter className="-mx-5 -mb-5 flex-wrap px-5 py-3.5">
          <Button
            ref={cancel}
            variant={safeFirst ? "default" : "outline"}
            disabled={busy}
            onClick={() => {
              setDownloadError(undefined);
              onCancel();
            }}
          >
            {cancelLabel ?? t("Cancel")}
          </Button>
          {save && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void keepAndLeave("save")}
            >
              <Save />
              {working === "save" ? t("Saving…") : t("Save and leave")}
            </Button>
          )}
          {download && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void keepAndLeave("download")}
            >
              <Download />
              {working === "download"
                ? t("Preparing .zip…")
                : t("Download .zip and leave")}
            </Button>
          )}
          <Button
            variant={
              destructive ? "destructive" : safeFirst ? "outline" : "default"
            }
            disabled={busy}
            onClick={onConfirm}
          >
            {pending ? t("Working…") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Asks through the shared dialog; resolves true when the author confirms. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm needs a ConfirmProvider");
  return confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<
    (ConfirmOptions & { resolve(confirmed: boolean): void }) | null
  >(null);
  const pendingRequest = useRef<typeof request>(null);
  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        // A newer question replaces an unanswered one; the older caller stays put.
        pendingRequest.current?.resolve(false);
        const next = { ...options, resolve };
        pendingRequest.current = next;
        setRequest(next);
      }),
    [],
  );
  const settle = (confirmed: boolean) => {
    pendingRequest.current?.resolve(confirmed);
    pendingRequest.current = null;
    setRequest(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <ConfirmDialog
          open
          title={request.title}
          description={request.description}
          confirmLabel={request.confirmLabel}
          cancelLabel={request.cancelLabel}
          safeFirst={request.safeFirst}
          destructive={request.destructive}
          download={request.download}
          save={request.save}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}
