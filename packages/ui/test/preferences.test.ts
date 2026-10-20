import assert from "node:assert/strict";
import test from "node:test";
import {
  resolvePreferences,
  translate,
  vietnamese,
} from "../web/src/lib/i18n.js";
import { enumDescription } from "../web/src/lib/enum-description.js";
import { EDGE_KINDS, NODE_TYPES } from "@sontx/simplink-core";
import { label } from "../web/src/lib/utils.js";

test("preferences honor saved choices and otherwise use browser defaults", () => {
  assert.deepEqual(resolvePreferences({}, "vi-VN", true), {
    language: "vi",
    theme: "dark",
  });
  assert.deepEqual(
    resolvePreferences({ language: "en", theme: "light" }, "vi", true),
    { language: "en", theme: "light" },
  );
  assert.deepEqual(
    resolvePreferences({ language: "invalid", theme: "invalid" }, "fr", false),
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
