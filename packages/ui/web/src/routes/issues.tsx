import { enumDescription } from "../lib/enum-description.js";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { kbQuery } from "../api.js";
import { Badge, Eyebrow, Page } from "../components/ui/primitives.js";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "../components/ui/select.js";
export const Route = createFileRoute("/issues")({
  validateSearch: (s: Record<string, unknown>) => ({
    severity:
      s.severity === "error" || s.severity === "warning" ? s.severity : "",
  }),
  component: Issues,
});

function Issues() {
  const { data: kb } = useQuery(kbQuery);
  const { severity } = Route.useSearch();
  const navigate = Route.useNavigate();
  const issues =
    kb?.issues.filter((i) => !severity || i.severity === severity) ?? [];
  const codes = [...new Set(issues.map((i) => i.code))].sort();
  return (
    <Page>
      <div className="mb-6.25 flex items-center justify-between gap-6.25 max-[780px]:gap-2.5">
        <div>
          <Eyebrow>VALIDATION</Eyebrow>
          <h1 className="mt-1.25 mb-2 max-[780px]:text-[22px]">
            Issues <span className="text-[#938c9f]">{issues.length}</span>
          </h1>
        </div>
        <Select
          value={severity || "all"}
          onValueChange={(value) =>
            void navigate({
              search: { severity: value === "all" ? "" : value },
            })
          }
        >
          <SelectTrigger
            aria-label="Severity"
            title={enumDescription(severity, "issue")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem
                value="error"
                title={enumDescription("error", "issue")}
              >
                Errors
              </SelectItem>
              <SelectItem
                value="warning"
                title={enumDescription("warning", "issue")}
              >
                Warnings
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {!codes.length && (
        <div className="px-6.25 py-17.5 text-center text-[#a494b0]">
          <h2>All clear</h2>
          <p className="text-[#938c9f]">No issues match this view.</p>
        </div>
      )}
      {codes.map((code) => (
        <section className="my-7.5" key={code}>
          <h3 className="text-[11px] font-normal text-[#a396ae]">
            <Badge type={code.startsWith("E") ? "error" : "warning"}>
              {code}
            </Badge>{" "}
            {issues.filter((i) => i.code === code).length} issues
          </h3>
          {issues
            .filter((i) => i.code === code)
            .map((issue, index) => {
              const node = kb?.nodes.find((n) => n.path === issue.path);
              return (
                <div
                  className="flex items-center justify-between gap-5 border-b border-[#eae3f0] px-3 py-4.25 max-[780px]:flex-col max-[780px]:items-start"
                  key={index}
                >
                  <div>
                    <p className="mb-1.25 text-xs">{issue.message}</p>
                    <code className="text-[#938c9f]">{issue.path}</code>
                  </div>
                  {node ? (
                    <div className="flex flex-wrap items-center gap-2.25 text-[11px] whitespace-nowrap">
                      <Link to="/graph" search={{ focus: node.id }}>
                        Graph
                      </Link>
                      <Link
                        to="/nodes/$id"
                        params={{ id: node.id }}
                        search={{ tab: "source" }}
                      >
                        Source ↗
                      </Link>
                    </div>
                  ) : (
                    <span className="text-[#938c9f]">
                      Fix this file on disk, then Reload
                    </span>
                  )}
                </div>
              );
            })}
        </section>
      ))}
    </Page>
  );
}
