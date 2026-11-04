import assert from "node:assert/strict";
import test from "node:test";
import { resolvePreferences, translate, vietnamese } from "../src/lib/i18n.js";
import { REQUESTS } from "../src/lib/simp-network.js";
import { enumDescription } from "../src/lib/enum-description.js";
import { EDGE_KINDS, NODE_TYPES } from "@sontx/simplink-core";
import { groupByType, label } from "../src/lib/utils.js";

test("preferences honor saved choices and default to light with browser language", () => {
  assert.deepEqual(resolvePreferences({}, "vi-VN"), {
    language: "vi",
    theme: "light",
  });
  assert.deepEqual(resolvePreferences({ theme: "dark" }, "en"), {
    language: "en",
    theme: "dark",
  });
  assert.deepEqual(
    resolvePreferences({ language: "en", theme: "light" }, "vi"),
    { language: "en", theme: "light" },
  );
  assert.deepEqual(
    resolvePreferences({ language: "invalid", theme: "invalid" }, "fr"),
    { language: "en", theme: "light" },
  );
});

test("translations interpolate values without changing user content", () => {
  assert.equal(translate("vi", "Search nodes…"), "Tìm nút…");
  assert.equal(
    translate("en", "Page {page} of {total}", { page: 2, total: 5 }),
    "Page 2 of 5",
  );
  assert.equal(
    translate("vi", "Add {type}", { type: "quy trình" }),
    "Thêm quy trình",
  );
  assert.equal(translate("vi", "User-authored title"), "User-authored title");
  assert.equal(
    enumDescription("goal", undefined, "vi"),
    "Kết quả bạn muốn đạt được.",
  );
  assert.notEqual(
    enumDescription("warning", "issue", "vi"),
    enumDescription("warning", undefined, "vi"),
  );
});

test("Vietnamese covers every built-in enum and preserves message placeholders", () => {
  for (const value of [
    ...NODE_TYPES,
    ...EDGE_KINDS,
    "active",
    "deprecated",
    "blocking",
    "warning",
    "error",
  ]) {
    assert.notEqual(
      label(value, "vi"),
      label(value),
      `Missing label: ${value}`,
    );
    assert.notEqual(
      enumDescription(value, undefined, "vi"),
      enumDescription(value),
      `Missing explanation: ${value}`,
    );
  }
  for (const [message, translation] of Object.entries(vietnamese)) {
    assert.ok(translation.trim(), `Empty translation: ${message}`);
    assert.deepEqual(
      [...translation.matchAll(/\{\w+\}/g)].map(([key]) => key).sort(),
      [...message.matchAll(/\{\w+\}/g)].map(([key]) => key).sort(),
      `Changed placeholders: ${message}`,
    );
  }
});

test("groupByType orders node types canonically and keeps unknown types last", () => {
  const items = [
    { id: "a", type: "missing" },
    { id: "b", type: "state" },
    { id: "c", type: "goal" },
    { id: "d", type: "state" },
  ];
  assert.deepEqual(
    groupByType(items, (item) => item.type).map(([type, list]) => [
      type,
      list.map((item) => item.id),
    ]),
    [
      ["goal", ["c"]],
      ["state", ["b", "d"]],
      ["missing", ["a"]],
    ],
  );
});

test("labels keep initialisms upper case", () => {
  assert.equal(label("check-in-ci"), "Check in CI");
  assert.equal(label("create-kb"), "Create KB");
  assert.equal(label("ui"), "UI");
  assert.equal(label("constrained_by"), "Constrained by");
  assert.equal(label("guidance"), "Guidance");
});

test("every open-screen question and answer has a Vietnamese translation", () => {
  for (const { ask, answer } of Object.values(REQUESTS)) {
    assert.ok(vietnamese[ask], ask);
    assert.ok(vietnamese[answer], answer);
  }
});
