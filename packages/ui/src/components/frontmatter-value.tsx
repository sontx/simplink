import { usePreferences } from "./preferences.js";

const MAX_DEPTH = 6;

function isScalar(value: unknown): boolean {
  return value === null || typeof value !== "object";
}

/**
 * Frontmatter as an author reads it: lists one entry per line, maps as
 * labelled rows, nested to any depth the YAML uses.
 */
export function FrontmatterValue({
  value,
  depth = 0,
}: {
  value: unknown;
  depth?: number;
}) {
  const { t, label } = usePreferences();
  if (value === null || value === undefined || value === "")
    return <span className="opacity-60">—</span>;
  if (isScalar(value)) return <>{String(value)}</>;
  if (value instanceof Date) return <>{value.toISOString().slice(0, 10)}</>;
  // Past this depth the shape is unusual enough that compact text reads better.
  if (depth >= MAX_DEPTH) return <code>{safeJson(value)}</code>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className="opacity-60">{t("None")}</span>;
    const items = value as unknown[];
    return (
      <ul
        className={
          items.every(isScalar)
            ? "m-0 flex list-none flex-col gap-0.5 p-0"
            : "m-0 flex list-none flex-col gap-2 p-0"
        }
      >
        {items.map((item, index) => (
          <li
            key={index}
            className={
              isScalar(item)
                ? "relative pl-3 before:absolute before:top-[0.6em] before:left-0 before:size-1 before:rounded-full before:bg-border"
                : "border-t border-border pt-2 first:border-t-0 first:pt-0"
            }
          >
            <FrontmatterValue value={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return <span className="opacity-60">{t("None")}</span>;
  // Label and value sit side by side when there is room; on narrow columns the
  // label stacks above its value so values never break mid-word.
  return (
    <div className="@container">
      <dl className="m-0 grid grid-cols-1 gap-y-0.5 @[15rem]:gap-y-1 @[15rem]:grid-cols-[minmax(0,max-content)_minmax(0,1fr)] @[15rem]:gap-x-3">
        {entries.map(([key, item]) => (
          <div key={key} className="contents">
            <dt className="font-medium text-foreground/80">{label(key)}</dt>
            <dd className="m-0 min-w-0 @max-[15rem]:mb-1.5">
              <FrontmatterValue value={item} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
