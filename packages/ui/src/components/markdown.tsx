import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { cn } from "../lib/utils.js";
import ReactMarkdown from "react-markdown";
import { isLocalUrl, resolveAsset } from "@sontx/simplink-core/browser";
import remarkGfm from "remark-gfm";
import React, {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useState,
  type ComponentProps,
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

/** Where Markdown images come from: the open workspace provides it; without one, local images show their alt text. */
export const AssetContext = createContext<{
  asset(relPath: string): Promise<Blob | string>;
} | null>(null);

/**
 * An image from the open KB: `src` resolves against `base` (the file it is written in) to a KB path,
 * which the store hands over as a File drawn straight from disk (a blob: URL) or a remote URL.
 * External URLs pass through; a missing file shows the alt text.
 */
function KBImage({
  src,
  base,
  ...props
}: ComponentProps<"img"> & { base: string }) {
  const service = useContext(AssetContext);
  const url = typeof src === "string" ? src : "";
  const kbPath = isLocalUrl(url) ? resolveAsset(base, url) : undefined;
  const [shown, setShown] = useState<string>();
  useEffect(() => {
    setShown(undefined);
    if (!service || !kbPath) return;
    let live = true;
    let objectUrl: string | undefined;
    service.asset(kbPath).then(
      (asset) => {
        if (!live) return;
        if (typeof asset !== "string") objectUrl = URL.createObjectURL(asset);
        setShown(objectUrl ?? (asset as string));
      },
      () => {},
    );
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [service, kbPath]);
  return <img {...props} src={kbPath ? shown : url || undefined} />;
}

export function Markdown({
  content,
  path = "",
  assetBase,
  layout = "site",
  className,
  nodeIds,
}: {
  content: string;
  path?: string;
  /** File the content was written in, for resolving relative image paths; defaults to `path`. */
  assetBase?: string;
  layout?: string;
  className?: string;
  /**
   * Inline code that is exactly one of these ids links to that node, as in
   * rendered plans. Given types (id → type), the link carries its type dot.
   */
  nodeIds?: ReadonlySet<string> | ReadonlyMap<string, string>;
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
          img: ({ node: _node, ...props }) => (
            <KBImage {...props} base={assetBase ?? path} />
          ),
          h1: ({ children }) => <h1 id={headingId(children)}>{children}</h1>,
          h2: ({ children }) => <h2 id={headingId(children)}>{children}</h2>,
          h3: ({ children }) => <h3 id={headingId(children)}>{children}</h3>,
          h4: ({ children }) => <h4 id={headingId(children)}>{children}</h4>,
          h5: ({ children }) => <h5 id={headingId(children)}>{children}</h5>,
          h6: ({ children }) => <h6 id={headingId(children)}>{children}</h6>,
          code: ({ children, className, node: _node, ...props }) => {
            const id = typeof children === "string" ? children : undefined;
            const type =
              id && nodeIds instanceof Map ? nodeIds.get(id) : undefined;
            return id && !className && nodeIds?.has(id) ? (
              <Link
                to="/nodes/$id"
                params={{ id }}
                className={cn("node-ref", type)}
              >
                <code {...props}>
                  {type && <span aria-hidden className="node-ref-dot" />}
                  {id}
                </code>
              </Link>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
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
