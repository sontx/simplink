import { useWorkspace } from "../workspace/context.js";
import { usePreferences } from "./preferences.js";
import { cn, groupByType } from "../lib/utils.js";
import { useMemo, useState } from "react";
import { Plus, Undo2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "./ui/command.js";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.js";
import { Link } from "@tanstack/react-router";
import { kbQuery, nodeQuery, planQuery, schemaQuery } from "../api.js";
import {
  Badge,
  Button,
  Dialog,
  ErrorMessage,
  Glossary,
} from "./ui/primitives.js";
import { Markdown } from "./markdown.js";

export const inspectorClass =
  "w-75 shrink-0 animate-in overflow-auto border-l border-border bg-card px-5.75 py-6.75 duration-200 ease-out fade-in max-[1100px]:w-65 max-[1100px]:px-4.25 max-[1100px]:py-5.5 max-[780px]:absolute max-[780px]:inset-y-0 max-[780px]:right-0 max-[780px]:z-10 max-[780px]:w-60 max-[780px]:shadow-[-10px_0_30px_#3b204410]";

export const issueClass = (severity: string) =>
  cn(
    "my-2 rounded-sm px-2.5 py-2.25 text-[11px] leading-normal",
    severity === "error" ? "bg-destructive/10" : "bg-warning/10",
  );

/** The rendered agent plan for a goal or procedure, its node ids linking to their nodes. */
export function PlanBody({ id }: { id: string }) {
  const { service } = useWorkspace();
  const { t } = usePreferences();
  const plan = useQuery(planQuery(service, id));
  const { data: kb } = useQuery(kbQuery(service));
  const nodeIds = useMemo(
    () => new Map(kb?.nodes.map((node) => [node.id, node.type])),
    [kb],
  );
  return (
    <>
      <ErrorMessage error={plan.error} />
      {plan.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("Resolving plan…")}
        </p>
      ) : (
        <Markdown
          content={plan.data?.rendered.text ?? ""}
          className="markdown-compact"
          nodeIds={nodeIds}
        />
      )}
    </>
  );
}

export function Plan({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = usePreferences();
  return (
    <Dialog
      open
      onOpenChange={onClose}
      title={t("Agent plan")}
      sheet
      resizeKey="simplink.planDrawerWidth"
    >
      <PlanBody id={id} />
    </Dialog>
  );
}

export function Docs({
  title,
  body,
  onClose,
}: {
  title: string;
  body: string;
  onClose: () => void;
}) {
  const { t } = usePreferences();
  return (
    <Dialog
      open
      onOpenChange={onClose}
      title={title}
      sheet
      resizeKey="simplink.docsDrawerWidth"
    >
      {body.trim() ? (
        <Markdown content={body} />
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("No documentation for this node.")}
        </p>
      )}
    </Dialog>
  );
}

export function Inspector({
  id,
  className,
  onClose,
}: {
  id: string;
  className?: string;
  /** Phones only: the inspector covers the canvas there, so it needs a way out. */
  onClose?: () => void;
}) {
  const { service } = useWorkspace();
  const { t, label, enumDescription } = usePreferences();

  const { data: detail, error } = useQuery(nodeQuery(service, id));
  const { data: kb } = useQuery(kbQuery(service));
  const { data: schema } = useQuery(schemaQuery(service));
  const [adding, setAdding] = useState<string>();
  const [plan, setPlan] = useState(false);
  const [docs, setDocs] = useState(false);
  // The last relationship edit, announced, with the targets to restore on undo.
  const [change, setChange] = useState<{
    message: string;
    undo?: { kind: string; targets: string[] };
  }>();
  const client = useQueryClient();
  const patch = useMutation({
    mutationFn: ({
      kind,
      targets,
    }: {
      kind: string;
      targets: string[];
      message: string;
      undo?: { kind: string; targets: string[] };
    }) => service.patchEdges(id, kind, targets),
    onMutate: () => setChange(undefined),
    onSuccess: async (_result, { message, undo }) => {
      setAdding(undefined);
      setChange({ message, undo });
      await client.invalidateQueries();
    },
  });
  const titleOf = (target: string) =>
    kb?.nodes.find((n) => n.id === target)?.title;
  if (!detail)
    return (
      <aside className={cn(inspectorClass, className)}>
        <ErrorMessage error={error} />
        <p className="text-xs leading-[1.7]">{t("Loading node…")}</p>
      </aside>
    );
  const { node, out } = detail;
  return (
    <aside
      className={cn(
        inspectorClass,
        "flex flex-col overflow-hidden! p-0! max-[1100px]:p-0!",
        className,
      )}
    >
      <div className="min-h-0 flex-1 overflow-auto px-5.75 py-6.75 max-[1100px]:px-4.25 max-[1100px]:py-5.5">
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="float-right -mt-1.5 -mr-2 min-[781px]:hidden"
            aria-label={t("Close")}
            onClick={onClose}
          >
            <X />
          </Button>
        )}
        <Badge type={node.type}>{label(node.type)}</Badge>
        <h2 className="mt-3.25 mb-2.5 wrap-anywhere">{node.title}</h2>
        <code className="mb-3.5 block wrap-anywhere text-muted-foreground">
          {id}
        </code>
        <p className="text-xs leading-[1.7] text-muted-foreground">
          {node.summary}
        </p>
        {kb?.issues
          .filter((i) => i.path === node.path)
          .map((i, index) => (
            <div key={index} className={issueClass(i.severity)}>
              <span className={cn(i.severity, "font-medium text-(--type-ink)")}>
                {i.code}
              </span>{" "}
              {i.message}
            </div>
          ))}
        <h3 className="mt-6.25 border-t border-border pt-5.5">
          {t("Relationships")}
        </h3>
        <ErrorMessage error={patch.error} />
        <div role="status" aria-live="polite">
          {change && (
            <div className="my-2 flex items-center justify-between gap-2 rounded-sm bg-muted py-1 pr-1 pl-2.5 text-[11px]">
              <span className="min-w-0">{change.message}</span>
              {change.undo && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="shrink-0"
                  disabled={patch.isPending}
                  onClick={() =>
                    patch.mutate({
                      ...change.undo!,
                      message: t("Restored."),
                    })
                  }
                >
                  <Undo2 data-icon="inline-start" />
                  {t("Undo")}
                </Button>
              )}
            </div>
          )}
        </div>
        {Object.entries(schema?.[node.type] ?? {}).map(([kind, type]) => {
          const targets = out
            .filter((e) => e.kind === kind && e.source === "frontmatter")
            .map((e) => e.to);
          return (
            <section className="mb-3" key={kind}>
              <div className="my-1.5 flex items-center justify-between gap-3">
                <strong className="text-[11px] font-medium text-muted-foreground">
                  {label(kind)}
                </strong>
                {!service.store.readOnly && (
                  <Popover
                    open={adding === kind}
                    onOpenChange={(open) => setAdding(open ? kind : undefined)}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("Add {type}", { type: label(kind) })}
                      >
                        <Plus />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="end">
                      <Command>
                        <CommandInput
                          placeholder={t("Find {type}…", { type: label(type) })}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {t("No matching targets.")}
                          </CommandEmpty>
                          {groupByType(
                            kb?.nodes.filter(
                              (n) =>
                                (type === "node" || n.type === type) &&
                                n.id !== id &&
                                !targets.includes(n.id),
                            ) ?? [],
                            (n) => n.type,
                          ).map(([group, nodes]) => (
                            <CommandGroup key={group} heading={label(group)}>
                              {nodes.map((n) => (
                                <CommandItem
                                  key={n.id}
                                  value={`${n.title} ${n.id}`}
                                  onSelect={() =>
                                    patch.mutate({
                                      kind,
                                      targets: [...targets, n.id],
                                      message: t("Added {title} to {kind}.", {
                                        title: n.title,
                                        kind: label(kind),
                                      }),
                                      undo: { kind, targets },
                                    })
                                  }
                                >
                                  <div className="flex min-w-0 flex-col">
                                    <span className="truncate">{n.title}</span>
                                    <span className="truncate text-xs text-muted-foreground">
                                      {n.id}
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              {targets.map((target) => {
                const title = titleOf(target);
                return (
                  <div
                    className="my-1 flex items-center justify-between gap-2"
                    key={target}
                  >
                    {/* Titles first, so authors needn't recall what an ID names. */}
                    <Link
                      to="/graph"
                      search={{ focus: target }}
                      className="group/target flex min-w-0 flex-col"
                    >
                      <span
                        className={cn(
                          "truncate text-xs text-foreground group-hover/target:text-primary-ink",
                          !title && "text-destructive",
                        )}
                      >
                        {title ?? t("Missing node")}
                      </span>
                      <span className="truncate font-mono text-[11px] text-muted-foreground">
                        {target}
                      </span>
                    </Link>
                    {!service.store.readOnly && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label={t("Remove {target}", {
                          target: title ?? target,
                        })}
                        disabled={patch.isPending}
                        onClick={() =>
                          patch.mutate({
                            kind,
                            targets: targets.filter((t) => t !== target),
                            message: t("Removed {title} from {kind}.", {
                              title: title ?? target,
                              kind: label(kind),
                            }),
                            undo: { kind, targets },
                          })
                        }
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
        <Glossary
          summary={t("What these relationships mean")}
          entries={Object.keys(schema?.[node.type] ?? {}).map((kind) => ({
            key: kind,
            term: label(kind),
            description: enumDescription(kind),
          }))}
        />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2.25 border-t border-border bg-card px-5.75 py-3.5 max-[1100px]:px-4.25">
        {/* Read-only workspaces have nothing to edit, so the action is not primary. */}
        <Button
          variant={service.store.readOnly ? "outline" : "default"}
          asChild
        >
          <Link to="/nodes/$id" params={{ id }} search={{ tab: "source" }}>
            {service.store.readOnly ? t("View source") : t("Open editor")}
          </Link>
        </Button>
        {["goal", "procedure"].includes(node.type) && (
          <Button variant="outline" onClick={() => setPlan(true)}>
            {t("Plan")}
          </Button>
        )}
        <Button variant="outline" onClick={() => setDocs(true)}>
          {t("Docs")}
        </Button>
      </div>
      {plan && <Plan id={id} onClose={() => setPlan(false)} />}
      {docs && (
        <Docs
          title={node.title}
          body={node.body}
          onClose={() => setDocs(false)}
        />
      )}
    </aside>
  );
}
