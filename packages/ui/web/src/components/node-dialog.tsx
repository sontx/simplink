import { useWorkspace } from "../workspace/context.js";
import { usePreferences } from "./preferences.js";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  ErrorMessage,
  Input,
  Textarea,
} from "./ui/primitives.js";
const field = "grid gap-1.75 text-xs text-muted-foreground";
const folders: Record<string, string> = {
  goal: "goals",
  procedure: "procedures",
  capability: "capabilities",
  state: "states",
  constraint: "constraints",
};
export function NodeDialog({
  type,
  onClose,
  onCreated,
}: {
  type: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { service } = useWorkspace();
  const { t, label } = usePreferences();
  const [path, setPath] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: async () => {
      const relative = `${folders[type]}/${path.replace(/\.md$/, "")}.md`;
      await service.writeFile(
        relative,
        `---\ntype: ${type}\ntitle: ${JSON.stringify(title)}\nsummary: ${JSON.stringify(summary)}\nstatus: active\n${type === "constraint" ? "severity: warning\n" : ""}${type === "goal" ? `when_to_use:\n  - ${JSON.stringify(summary)}\nprocedures: []\n` : ""}${type === "state" ? `check: ${JSON.stringify(summary)}\nsatisfied_by: []\n` : ""}---\n\n# ${title}\n${type === "procedure" ? `\n## Steps\n\n1. ${summary}\n` : ""}`,
        { create: true },
      );
      return `${type}.${path.replace(/\.md$/, "").replaceAll("/", ".")}`;
    },
    onSuccess: async (id) => {
      await client.invalidateQueries();
      onCreated(id);
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={onClose}
      title={t("New {type}", { type: label(type).toLowerCase() })}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="grid gap-3.75"
      >
        <label className={field}>
          {t("Path within {folder}", { folder: folders[type] })}
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="messaging/send-message"
            pattern="[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*(\.md)?"
            required
          />
        </label>
        <small>
          {folders[type]}/{path || "your-node"}.md
        </small>
        <label className={field}>
          {t("Title")}
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <label className={field}>
          {t("Summary")}
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            required
          />
        </label>
        <ErrorMessage error={create.error} />
        <Button variant="default" disabled={create.isPending}>
          {t("Create node")}
        </Button>
      </form>
    </Dialog>
  );
}
