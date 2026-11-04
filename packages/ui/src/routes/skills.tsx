import { createFileRoute } from "@tanstack/react-router";
import { zipSync, strToU8 } from "fflate";
import { Download } from "lucide-react";
import { usePreferences } from "../components/preferences.js";
import { downloadBlob } from "../lib/utils.js";
import { Button, Page } from "../components/ui/primitives.js";

export const Route = createFileRoute("/skills")({ component: Skills });

// Bundled at build time from the repository's agent skills.
const PREFIX = "../../../../.agents/skills/";
const files = import.meta.glob<string>("../../../../.agents/skills/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
});

function downloadBundle() {
  const zip = zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, text]) => [
        path.slice(PREFIX.length),
        strToU8(text),
      ]),
    ),
  );
  downloadBlob(
    new Blob([zip], { type: "application/zip" }),
    "simplink-skills.zip",
  );
}

const SKILLS = [
  {
    name: "product-kb-builder",
    summary:
      "Builds or re-syncs a knowledge base from a product's source code and docs. Use it when the agent can read the codebase.",
    example: "Build a KB for this repo's billing module.",
  },
  {
    name: "docs-kb-builder",
    summary:
      "Builds or re-syncs a knowledge base from a documentation site, help center, or folder of doc pages, when no source code is available. Reuses product-kb-builder's references and scripts, so install both.",
    example: "Build a KB from https://docs.example.com/guides.",
  },
  {
    name: "simplink-usage",
    summary:
      "Uses the Simplink packages from the command line or from code: lint, search, and resolve a KB, export docs, serve it over MCP, run a simp node, or embed KB tools in an app.",
    example: "Connect our kb folder to Claude Code over MCP.",
  },
];

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-md border bg-muted p-3 text-xs">
      <code>{children}</code>
    </pre>
  );
}

function Skills() {
  const { t } = usePreferences();
  return (
    <Page className="max-w-200">
      <div className="mb-6.25 flex items-start justify-between gap-6.25 max-[780px]:flex-col max-[780px]:gap-2.5">
        <div>
          <h1 className="mb-2">{t("Skills")}</h1>
          <p className="text-muted-foreground">
            {t(
              "Skills teach a coding agent how to write and use a Simplink knowledge base.",
            )}
          </p>
        </div>
        <Button onClick={downloadBundle}>
          <Download />
          {t("Download skills (.zip)")}
        </Button>
      </div>

      <div className="grid gap-4">
        {SKILLS.map((skill) => (
          <section key={skill.name} className="rounded-lg border bg-card p-5">
            <h2 className="font-mono text-base">{skill.name}</h2>
            <p className="mt-2">{t(skill.summary)}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Try asking:")} <em>“{skill.example}”</em>
            </p>
          </section>
        ))}
      </div>

      <h2 className="mt-8.75 mb-3">{t("Set up in your coding agent")}</h2>
      <ol className="grid list-decimal gap-5 pl-5">
        <li>
          {t(
            "Install the Simplink CLI in the project; the skills run simp-lint, simp-search, and simp-resolve.",
          )}
          <Code>npm install -D @sontx/simplink-core</Code>
        </li>
        <li>
          {t(
            "Unzip the bundle into your agent's skills folder. Keep the folders side by side.",
          )}
          <div className="mt-3 text-sm font-semibold">Claude Code</div>
          <Code>
            {
              "# this project only\nunzip simplink-skills.zip -d .claude/skills\n# or every project\nunzip simplink-skills.zip -d ~/.claude/skills"
            }
          </Code>
          <div className="mt-3 text-sm font-semibold">Codex</div>
          <Code>
            {
              "# this project only\nunzip simplink-skills.zip -d .agents/skills\n# or every project\nunzip simplink-skills.zip -d ~/.codex/skills"
            }
          </Code>
          <p className="mt-3 text-sm text-muted-foreground">
            {t(
              "Other agents: use the agent's skills folder if it supports Agent Skills, or tell it to read the SKILL.md file before starting.",
            )}
          </p>
        </li>
        <li>
          {t(
            "Restart the agent, then ask for a knowledge base in plain words. The agent loads the matching skill.",
          )}
        </li>
        <li>
          {t(
            "Open the resulting kb folder here to review the graph and fix issues.",
          )}
        </li>
      </ol>
    </Page>
  );
}
