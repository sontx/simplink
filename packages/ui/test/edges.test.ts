import test from "node:test";
import assert from "node:assert/strict";
import { editEdges } from "../src/workspace/edges.js";

test("edge edits preserve comments, flow style, CRLF and body bytes", () => {
  for (const newline of ["\n", "\r\n"]) {
    const raw =
      "---\n# preserved\ntype: procedure\nuses: [capability.old] # edge comment\ntitle: Keep\n---\n\nBody  \n".replace(
        /\n/g,
        newline,
      );
    // Removing the last target drops the key, its comment and its line.
    assert.equal(
      editEdges(raw, "uses", []),
      raw.replace(`uses: [capability.old] # edge comment${newline}`, ""),
    );
    assert.equal(editEdges(raw, "requires", []), raw);
    for (const following of ["", "title: Keep\n"]) {
      const block =
        `---\ntype: procedure\nuses:\n  - capability.old\n${following}---\n\nBody  \n`.replace(
          /\n/g,
          newline,
        );
      assert.equal(
        editEdges(block, "uses", []),
        block.replace(`uses:${newline}  - capability.old${newline}`, ""),
      );
    }
  }
  assert.throws(
    () => editEdges("No frontmatter", "uses", []),
    /Missing frontmatter/,
  );
  assert.throws(
    () => editEdges("---\nx: [\n---\n", "uses", []),
    /Invalid frontmatter/,
  );
});

test("edge edits produce valid YAML for unindented, empty and null values", () => {
  for (const value of ["\n- old", "", " ~"])
    assert.equal(
      editEdges(
        `---\ntype: procedure\nuses:${value}\ntitle: x\n---\n`,
        "uses",
        ["a", "b"],
      ),
      "---\ntype: procedure\nuses:\n  - a\n  - b\ntitle: x\n---\n",
    );
});
