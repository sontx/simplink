import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Undo2, X } from "lucide-react";
import { kbQuery } from "../api.js";
import { useWorkspace } from "../workspace/context.js";
import { usePreferences } from "./preferences.js";
import { Button, ErrorMessage } from "./ui/primitives.js";

/** After a delete: what went, and a way to put it back exactly as it was. */
export function DeletedNotice({ className }: { className?: string }) {
  const { service } = useWorkspace();
  const { t } = usePreferences();
  const { data: kb } = useQuery(kbQuery(service));
  const client = useQueryClient();
  const restore = useMutation({
    mutationFn: () => service.restoreDeleted(),
    onSettled: () => client.invalidateQueries(),
  });
  const deleted = kb?.deleted;
  return (
    // The live region stays mounted so the notice is announced when it appears.
    <div role="status" aria-live="polite">
      {deleted && !service.store.readOnly && (
        <div
          className={`${className ?? ""} flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-border bg-card py-1.5 pr-1.5 pl-3.5 text-sm`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Trash2
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 wrap-anywhere">
              {t("Deleted “{title}”.", { title: deleted.title })}{" "}
              <code className="text-muted-foreground">{deleted.path}</code>
            </span>
          </span>
          <span className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={restore.isPending}
              onClick={() => restore.mutate()}
            >
              <Undo2 data-icon="inline-start" />
              {restore.isPending ? t("Restoring…") : t("Undo")}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("Dismiss")}
              onClick={() => {
                service.dismissDeleted();
                void client.invalidateQueries({ queryKey: ["kb"] });
              }}
            >
              <X />
            </Button>
          </span>
        </div>
      )}
      <ErrorMessage error={restore.error} className="mt-2" />
    </div>
  );
}
