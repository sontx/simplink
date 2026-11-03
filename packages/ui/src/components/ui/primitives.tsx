import { usePreferences } from "../preferences.js";
import { useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { cn } from "../../lib/utils.js";
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
  const { enumDescription } = usePreferences();
  return (
    <ShadcnBadge
      variant="secondary"
      title={title ?? (type ? enumDescription(type, "issue") : undefined)}
      // ponytail: colours come from the --type-* tokens set by the type class
      className={type && `${type} bg-(--type-bg) text-(--type-color)`}
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
            title="Drag to resize"
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

export function ErrorMessage({ error }: { error: unknown }) {
  return error ? (
    <div role="alert" className="bg-destructive/10 p-3">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ) : null;
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

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3.5 text-[9px] font-[650] tracking-[1.7px] text-muted-foreground">
      {children}
    </div>
  );
}
