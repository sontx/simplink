import { isMap, isNode, isScalar, isSeq, parseDocument } from "yaml";
import { schemas } from "../lib/frontmatter.js";
import type { Schema } from "../api.js";

export function edgeSchema(): Schema {
  const [defs, ...types] = schemas;
  const result: Schema = {};
  for (const definition of types) {
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries({
      ...defs.$defs.common.properties,
      ...definition.properties,
    })) {
      const target = (value as { $ref?: string }).$ref?.match(
        /^(?:defs\.schema\.json)?#\/\$defs\/(\w+)Refs$/,
      )?.[1];
      if (target) fields[key] = target;
    }
    result[definition.properties.type.const] = fields;
  }
  return result;
}

export function editEdges(
  raw: string,
  kind: string,
  targets: string[],
): string {
  const block = /^(---\r?\n)([\s\S]*?)(^---[^\S\r\n]*(?:\r?\n|$))/m.exec(raw);
  if (!block || block.index !== 0) throw new Error("Missing frontmatter");
  const doc = parseDocument(block[2]);
  if (doc.errors.length) throw new Error("Invalid frontmatter");
  const previous = doc.get(kind, true);
  const original = pairRange(doc.contents, kind);
  // No targets left: drop the key rather than leave an empty `kind: []` behind.
  if (!targets.length) {
    if (!original) return raw;
    let end = original[1];
    // The rest of the line goes too, including a trailing comment on the edge.
    const after = /^[^\S\r\n]*(?:#[^\r\n]*)?(?:\r?\n|$)/.exec(
      block[2].slice(end),
    );
    if (!block[2].slice(0, end).endsWith("\n") && after) end += after[0].length;
    const yaml = block[2].slice(0, original[0]) + block[2].slice(end);
    return block[1] + yaml + raw.slice(block[1].length + block[2].length);
  }
  const replacement = doc.createNode(targets);
  if (isSeq(previous)) replacement.flow = previous.flow;
  doc.setIn([kind], replacement);
  // Patch only the selected key/value pair; unrelated frontmatter and the body keep their bytes.
  // Splicing the whole pair (not just the value) keeps indentation valid for any original layout.
  let yaml: string;
  if (original) {
    const rendered = doc.toString();
    const updated = pairRange(parseDocument(rendered).contents, kind);
    if (!updated) throw new Error("Invalid relationship field");
    const originalValue = block[2].slice(...original);
    const newline = block[1].includes("\r\n") ? "\r\n" : "\n";
    let value = rendered.slice(...updated).replace(/\r?\n/g, newline);
    if (originalValue.endsWith("\n") && !value.endsWith("\n")) value += newline;
    if (!originalValue.endsWith("\n") && value.endsWith(newline))
      value = value.slice(0, -newline.length);
    yaml = block[2].slice(0, original[0]) + value + block[2].slice(original[1]);
  } else {
    const added = parseDocument(`${kind}: []\n`);
    added.setIn([kind], replacement);
    yaml =
      block[2] +
      added
        .toString()
        .replace(/\n/g, block[1].includes("\r\n") ? "\r\n" : "\n");
  }
  return block[1] + yaml + raw.slice(block[1].length + block[2].length);
}

// Byte range of `kind: value` in a top-level map, from the key to the end of the value.
function pairRange(
  contents: unknown,
  kind: string,
): [number, number] | undefined {
  if (!isMap(contents)) return undefined;
  const pair = contents.items.find(
    (item) => isScalar(item.key) && item.key.value === kind,
  );
  if (!pair || !isScalar(pair.key) || !pair.key.range) return undefined;
  const end =
    isNode(pair.value) && pair.value.range
      ? pair.value.range[1]
      : pair.key.range[1];
  return [pair.key.range[0], end];
}
