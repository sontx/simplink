import { createKB } from "../src/kb.js";
import { memorySource } from "../src/source.js";

export async function product(
  name: string,
  peers: string[] = [],
  files: Record<string, string> = {},
) {
  return createKB(
    memorySource({
      "simp.md": `---\ntype: simp\nname: ${name}\ntitle: ${name}\nsummary: Product\npeers: [${peers.map((p) => `{name: ${p}}`).join(", ")}]\n---\n`,
      ...files,
    }),
  );
}
