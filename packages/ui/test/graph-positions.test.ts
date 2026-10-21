import test from "node:test";
import assert from "node:assert/strict";
import { applyLayoutChanges } from "../src/graph.js";

test("drag updates keep positions across layout and data refreshes", () => {
  const previous = { a: { position: { x: 10, y: 20 } } };
  const layout = applyLayoutChanges(previous, [
    { id: "a", type: "position", position: { x: 80, y: 90 }, dragging: true },
    { id: "b", type: "position", position: { x: 100, y: 120 } },
    { id: "a", type: "position", dragging: false },
  ]);
  assert.deepEqual(layout, {
    a: { position: { x: 80, y: 90 } },
    b: { position: { x: 100, y: 120 } },
  });
  assert.deepEqual(previous, { a: { position: { x: 10, y: 20 } } });
  assert.strictEqual(applyLayoutChanges(layout, []), layout);
  assert.strictEqual(
    applyLayoutChanges(layout, [
      { id: "a", type: "select", selected: true },
      { id: "a", type: "position", dragging: false },
    ]),
    layout,
  );
});

test("measured dimensions survive later drags so nodes stay visible", () => {
  const measured = applyLayoutChanges({}, [
    { id: "a", type: "dimensions", dimensions: { width: 230, height: 90 } },
  ]);
  const dragged = applyLayoutChanges(measured, [
    { id: "a", type: "position", position: { x: 5, y: 6 }, dragging: true },
  ]);
  assert.deepEqual(dragged, {
    a: { measured: { width: 230, height: 90 }, position: { x: 5, y: 6 } },
  });
});
