import { useRouter, useRouterState } from "@tanstack/react-router";
import { cn } from "../lib/utils.js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import React, {
  Children,
  isValidElement,
  useEffect,
  type ReactNode,
} from "react";

export const stripFrontmatter = (content: string) =>
  content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");

const headingText = (children: ReactNode): string =>
  Children.toArray(children)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? headingText(child.props.children)
        : String(child),
    )
    .join("");
export const headingId = (children: ReactNode) =>
  headingText(children)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

export function docHref(href: string, path: string, layout: string) {
  if (!/^(?:[a-z]+:|\/|#)/i.test(href) && /\.md(?:#.*)?$/.test(href)) {
    const resolved = new URL(href, `https://docs.local/${path}`);
    return `/docs/${resolved.pathname.slice(1)}?layout=${layout}${resolved.hash}`;
  }
  return href;
}

export function Markdown({
  content,
  path = "",
  layout = "site",
  className,
}: {
  content: string;
  path?: string;
  layout?: string;
  className?: string;
}) {
  const router = useRouter();
  const hash = useRouterState({ select: (state) => state.location.hash });
  useEffect(() => {
    if (hash) {
      try {
        document
          .getElementById(decodeURIComponent(hash.replace(/^#/, "")))
          ?.scrollIntoView();
      } catch {
        /* Ignore malformed external fragments. */
      }
    }
  }, [content, hash]);
  const text = content
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(
            /\[\[([^\]|#]+)(?:\|([^\]]+)|#([^\]]+))?\]\]/g,
            (_m, id, label) =>
              `[${label ?? id}](/nodes/${encodeURIComponent(id.trim())})`,
          ),
    )
    .join("");
  return (
    <article
      className={cn(
        "markdown text-sm leading-[1.75] text-foreground",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 id={headingId(children)}>{children}</h1>,
          h2: ({ children }) => <h2 id={headingId(children)}>{children}</h2>,
          h3: ({ children }) => <h3 id={headingId(children)}>{children}</h3>,
          h4: ({ children }) => <h4 id={headingId(children)}>{children}</h4>,
          h5: ({ children }) => <h5 id={headingId(children)}>{children}</h5>,
          h6: ({ children }) => <h6 id={headingId(children)}>{children}</h6>,
          a: ({ href, children, node: _node, ...props }) => {
            const to = docHref(href ?? "", path, layout);
            const internal = to.startsWith("/") && !to.startsWith("//");
            const destination = internal
              ? new URL(to, "https://docs.local")
              : null;
            const renderedHref = destination
              ? router.buildLocation({
                  to: destination.pathname,
                  search: Object.fromEntries(destination.searchParams),
                  hash: destination.hash.slice(1),
                }).href
              : to;
            return (
              <a
                href={renderedHref}
                {...props}
                onClick={(e) => {
                  // In-app paths go through the router; modified clicks keep browser behavior.
                  if (
                    !internal ||
                    e.button !== 0 ||
                    e.metaKey ||
                    e.ctrlKey ||
                    e.shiftKey ||
                    e.altKey
                  )
                    return;
                  e.preventDefault();
                  void router.navigate({ href: to });
                }}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </article>
  );
}
