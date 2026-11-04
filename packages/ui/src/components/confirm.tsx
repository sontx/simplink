import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Download } from "lucide-react";
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
  destructive?: boolean;
  /** Memory mode: offers "Download .zip and leave", which confirms once the download succeeds. */
  download?: () => Promise<void>;
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
  destructive = false,
  pending = false,
  error,
  onConfirm,
  onCancel,
  download,
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
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<unknown>();
  const busy = pending || downloading;
  async function downloadAndLeave() {
    if (!download) return;
    setDownloading(true);
    setDownloadError(undefined);
    try {
      await download();
      onConfirm();
    } catch (failure) {
      setDownloadError(failure);
    } finally {
      setDownloading(false);
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
            variant="outline"
            disabled={busy}
            onClick={() => {
              setDownloadError(undefined);
              onCancel();
            }}
          >
            {t("Cancel")}
          </Button>
          {download && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void downloadAndLeave()}
            >
              <Download />
              {downloading
                ? t("Preparing .zip…")
                : t("Download .zip and leave")}
            </Button>
          )}
          <Button
            variant={destructive ? "destructive" : "default"}
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
          destructive={request.destructive}
          download={request.download}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}
