export function dirname(value: string): string {
  if (!value) return ".";
  let end = value.length - 1;
  while (end > 0 && value[end] === "/") end--;
  const slash = value.lastIndexOf("/", end);
  if (slash < 0) return ".";
  if (slash === 0) return "/";
  return value.slice(0, slash);
}

export function basename(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

function segments(value: string): string[] {
  const result: string[] = [];
  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") result.pop();
    else result.push(part);
  }
  return result;
}

export function relative(from: string, to: string): string {
  const a = segments(from);
  const b = segments(to);
  let common = 0;
  while (common < a.length && a[common] === b[common]) common++;
  return [...a.slice(common).map(() => ".."), ...b.slice(common)].join("/");
}
