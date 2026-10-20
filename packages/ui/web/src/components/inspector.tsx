import { cn, label } from "../lib/utils.js";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "./ui/command.js";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.js";
import { Link } from "@tanstack/react-router";
import { api, kbQuery, nodeQuery, planQuery, schemaQuery } from "../api.js";
import { Badge, Button, Dialog, ErrorMessage } from "./ui/primitives.js";
import { Markdown } from "./markdown.js";

export const inspectorClass =
  "w-75 shrink-0 animate-in overflow-auto border-l border-[#ebe7f0] bg-card px-5.75 py-6.75 duration-200 ease-out fade-in max-[1100px]:w-65 max-[1100px]:px-4.25 max-[1100px]:py-5.5 max-[780px]:absolute max-[780px]:inset-y-0 max-[780px]:right-0 max-[780px]:z-10 max-[780px]:w-60 max-[780px]:shadow-[-10px_0_30px_#3b204410]";

export const issueClass = (severity: string) =>
  cn(
    "my-2 rounded-sm px-2.5 py-2.25 text-[11px] leading-normal",
    severity === "error" ? "bg-[#fcf0f2]" : "bg-[#fbf7ec]",
  );

export function Plan({ id, onClose }: { id: string; onClose: () => void }) {
  const plan = useQuery(planQuery(id));
  return (
    <Dialog open onOpenChange={onClose} title="Agent plan" sheet>
      <ErrorMessage error={plan.error} />
      {plan.isPending ? (
        <p>Resolving plan…</p>
      ) : (
        <Markdown content={plan.data?.rendered.text ?? ""} />
      )}
    </Dialog>
  );
}

export function Inspector({ id }: { id: string }) {
  const { data: detail, error } = useQuery(nodeQuery(id));
  const { data: kb } = useQuery(kbQuery);
  const { data: schema } = useQuery(schemaQuery);
  const [adding, setAdding] = useState<string>();
  const [plan, setPlan] = useState(false);
  const client = useQueryClient();
  const patch = useMutation({
    mutationFn: ({ kind, targets }: { kind: string; targets: string[] }) =>
      api(`/nodes/${encodeURIComponent(id)}/edges`, {
        method: "PATCH",
        body: JSON.stringify({ kind, targets }),
      }),
    onSuccess: async () => {
      setAdding(undefined);
      await client.invalidateQueries();
    },
  });
  if (!detail)
    return (
      <aside className={inspectorClass}>
        <ErrorMessage error={error} />
        <p className="text-xs leading-[1.7]">Loading node…</p>
      </aside>
    );
  const { node, out } = detail;
  return (
    <aside className={inspectorClass}>
      <Badge type={node.type}>{label(node.type)}</Badge>
      <h2 className="mt-3.25 mb-2.5 text-[18px] tracking-[-0.4px]">
        {node.title}
      </h2>
      <code className="mb-3.5 block text-[10px] wrap-anywhere text-[#a498ae]">
        {id}
      </code>
      <p className="text-xs leading-[1.7] text-[#938c9f]">{node.summary}</p>
      {kb?.issues
        .filter((i) => i.path === node.path)
        .map((i, index) => (
          <div key={index} className={issueClass(i.severity)}>
            {i.code} {i.message}
          </div>
        ))}
      <h3 className="mt-6.25 border-t border-[#eee9f2] pt-5.5">
        Relationships
      </h3>
      <ErrorMessage error={patch.error} />
      {Object.entries(schema?.[node.type] ?? {}).map(([kind, type]) => {
        const targets = out
          .filter((e) => e.kind === kind && e.source === "frontmatter")
          .map((e) => e.to);
        return (
          <section className="mb-3" key={kind}>
            <div className="my-1.5 flex items-center justify-between gap-3">
              <strong className="text-[10px] font-medium text-[#9a8ba5]">
                {label(kind)}
              </strong>
              <Popover
                open={adding === kind}
                onOpenChange={(open) => setAdding(open ? kind : undefined)}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Add ${kind}`}
                  >
                    +
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="end">
                  <Command>
                    <CommandInput placeholder={`Find ${type}…`} />
                    <CommandList>
                      <CommandEmpty>No matching targets.</CommandEmpty>
                      {kb?.nodes
                        .filter(
                          (n) =>
                            (type === "node" || n.type === type) &&
                            !targets.includes(n.id),
                        )
                        .map((n) => (
                          <CommandItem
                            key={n.id}
                            value={`${n.title} ${n.id}`}
                            onSelect={() =>
                              patch.mutate({
                                kind,
                                targets: [...targets, n.id],
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
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {targets.map((target) => (
              <div
                className="my-1.5 flex items-center justify-between gap-3"
                key={target}
              >
                <Link
                  to="/graph"
                  search={{ focus: target }}
                  className="truncate text-[10px] text-[#8b759e]"
                >
                  {target}
                </Link>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${target}`}
                  disabled={patch.isPending}
                  onClick={() =>
                    patch.mutate({
                      kind,
                      targets: targets.filter((t) => t !== target),
                    })
                  }
                >
                  ×
                </Button>
              </div>
            ))}
          </section>
        );
      })}
      <div className="mt-4.5 flex flex-wrap items-center gap-2.25">
        <Button variant="default" asChild>
          <Link to="/nodes/$id" params={{ id }} search={{ tab: "source" }}>
            Open editor
          </Link>
        </Button>
        {["goal", "procedure"].includes(node.type) && (
          <Button variant="outline" onClick={() => setPlan(true)}>
            Plan
          </Button>
        )}
      </div>
      {plan && <Plan id={id} onClose={() => setPlan(false)} />}
    </aside>
  );
}
