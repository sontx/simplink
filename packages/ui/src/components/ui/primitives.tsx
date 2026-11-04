import { usePreferences } from "../preferences.js";
import { useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { cn } from "../../lib/utils.js";
import { ChevronRight, CircleAlert, X } from "lucide-react";
import { Badge as ShadcnBadge } from "./badge.js";
import {
  Dialog as DialogRoot,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./dialog.js";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./sheet.js";

export { Button } from "./button.js";

export { Input } from "./input.js";

export { Textarea } from "./textarea.js";

export function Badge({
  type,
  children,
  title,
}: {
  title?: string;
  type?: string;
  children: ReactNode;
}) {
  return (
    <ShadcnBadge
      variant="secondary"
      title={title}
      // ponytail: colours come from the --type-* tokens set by the type class
      className={type && `${type} bg-(--type-bg) text-(--type-ink)`}
    >
      {children}
    </ShadcnBadge>
  );
}

const MIN_SHEET_WIDTH = 320;

function readStoredWidth(key: string): number | undefined {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value >= MIN_SHEET_WIDTH
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function useResizableWidth(storageKey: string | undefined) {
  const [width, setWidth] = useState<number | undefined>(() =>
    storageKey ? readStoredWidth(storageKey) : undefined,
  );
  const maxWidth = () => Math.max(MIN_SHEET_WIDTH, window.innerWidth - 40);
  const clamp = (value: number) =>
    Math.min(maxWidth(), Math.max(MIN_SHEET_WIDTH, value));

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let latest = width;
    const move = (e: PointerEvent) => {
      latest = clamp(window.innerWidth - e.clientX);
      setWidth(latest);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      if (storageKey && latest !== undefined) {
        try {
          window.localStorage.setItem(storageKey, String(Math.round(latest)));
        } catch {
          // Storage unavailable; width just won't persist.
        }
      }
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  return { width, onPointerDown, maxWidth };
}

function SheetDialog({
  open,
  onOpenChange,
  title,
  children,
  resizeKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  resizeKey?: string;
}) {
  const { t } = usePreferences();
  const { width, onPointerDown } = useResizableWidth(resizeKey);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="sm:max-w-xl"
        style={
          resizeKey && width !== undefined
            ? { width, maxWidth: "calc(100vw - 40px)" }
            : undefined
        }
        aria-describedby={undefined}
      >
        {resizeKey && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("Drag to resize")}
            title={t("Drag to resize")}
            className="group absolute inset-y-0 left-0 z-10 hidden w-3 cursor-col-resize touch-none items-center justify-center sm:flex"
            onPointerDown={onPointerDown}
          >
            <div className="h-10 w-1 rounded-full bg-border transition-colors group-hover:bg-muted-foreground group-active:bg-muted-foreground" />
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="px-6 pb-6">{children}</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  sheet = false,
  resizeKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  sheet?: boolean;
  resizeKey?: string;
}) {
  return sheet ? (
    <SheetDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      resizeKey={resizeKey}
    >
      {children}
    </SheetDialog>
  ) : (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </DialogRoot>
  );
}

/** Inline problem report. Known messages are translated; unknown ones show as written. */
export function ErrorMessage({
  error,
  className,
  onDismiss,
}: {
  error: unknown;
  className?: string;
  onDismiss?: () => void;
}) {
  const { t } = usePreferences();
  if (!error) return null;
  const message =
    (error instanceof Error ? error.message : String(error)) || "Error";
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-foreground",
        className,
      )}
    >
      <CircleAlert
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-destructive"
      />
      <p className="min-w-0 flex-1 leading-relaxed wrap-anywhere whitespace-pre-line">
        {t(message)}
      </p>
      {onDismiss && (
        <button
          type="button"
          aria-label={t("Dismiss")}
          title={t("Dismiss")}
          onClick={onDismiss}
          className="-my-1 -mr-1.5 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function Page({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto max-w-400 px-10.5 py-8.75 max-[1100px]:p-7 max-[780px]:px-4.5 max-[780px]:py-5.75",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The one small-heading role: matches the global `h3` for non-heading elements. */
export const sectionHeading = "text-xs font-[650] text-foreground";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3.5 text-[9px] font-[650] tracking-[1.7px] text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * A closed-by-default "what these mean" list, so term descriptions are
 * readable by keyboard, touch and screen-reader users, not only on hover.
 */
export function Glossary({
  entries,
  summary,
  className,
}: {
  entries: readonly {
    key: string;
    term: ReactNode;
    description: string | undefined;
  }[];
  summary?: string;
  className?: string;
}) {
  const { t } = usePreferences();
  const explained = entries.filter((entry) => entry.description);
  if (!explained.length) return null;
  return (
    <details className={cn("group text-sm", className)}>
      <summary className="flex w-fit cursor-pointer list-none items-start gap-1 rounded-sm text-xs leading-5 text-muted-foreground select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="mt-0.75 size-3.5 shrink-0 transition-transform group-open:rotate-90"
        />
        {summary ?? t("What these mean")}
      </summary>
      <dl className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] gap-x-6 gap-y-2 text-xs">
        {explained.map(({ key, term, description }) => (
          <div key={key}>
            <dt className="font-medium">{term}</dt>
            <dd className="m-0 mt-0.5 leading-5 text-muted-foreground">
              {description}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
