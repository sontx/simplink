import { enumDescription } from "../../lib/enum-description.js";
import type { ReactNode } from "react";
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

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  sheet = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  sheet?: boolean;
}) {
  return sheet ? (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="overflow-y-auto sm:max-w-xl"
        aria-describedby={undefined}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="px-6 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
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
    <div role="alert" className="bg-[#fff0f2] p-3">
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
    <div className="mb-3.5 text-[9px] font-[650] tracking-[1.7px] text-[#9b94a6]">
      {children}
    </div>
  );
}
