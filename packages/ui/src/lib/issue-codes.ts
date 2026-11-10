import { translate, type Language } from "./i18n.js";

// Plain-language meaning of each lint code; kb/constraints/authoring documents the rules.
const meanings: Readonly<Record<string, string>> = {
  E001: "Two files have the same ID; only the first is loaded.",
  E002: "The id field does not match the file path. Remove it.",
  E003: "The file is outside a type folder, or its type does not match the folder.",
  E004: "The file path cannot form an ID. Use lowercase kebab-case names.",
  E005: "The frontmatter has a key this node type does not allow.",
  E006: "A required field or list item is missing.",
  E007: "A reference points to a node that does not exist.",
  E008: "A reference has the wrong node type for this field.",
  E009: "Requirements or choice options form a cycle.",
  E010: "A procedure needs a ## Steps section with a numbered list.",
  E011: "Goals cannot contain steps; move them to a procedure.",
  E012: "A value has the wrong type or is not one of the allowed values.",
  E013: "The frontmatter is missing or is not valid YAML.",
  E014: "Each choice must appear exactly once in ## Steps as choice:<id>.",
  E015: "Choice IDs or option keys are repeated.",
  E016: "A qualified reference names a simp that is not declared as a peer.",
  E017: "simp-sources.yaml is not a valid map of node IDs to source lists.",
  W101: "Nothing links to this node.",
  W102: "This goal has no aliases, so it is harder to find.",
  W103: "The summary is longer than 200 characters.",
  W104: "An active node references a deprecated one.",
  W105: "Another goal uses the same alias.",
  W106: "No procedure produces this state.",
  W107: "This procedure is available more widely than a capability it uses.",
  W108: "This choice has only one option.",
  W109: "A peer was unreachable, so remote references were not checked.",
  W112: "Inline sources are deprecated; move them to simp-sources.yaml so they are not published.",
  W113: "simp-sources.yaml lists a node that does not exist.",
};

/** The meaning of a lint code, or undefined for codes from custom rules. */
export function issueCodeMeaning(
  code: string,
  language: Language = "en",
): string | undefined {
  const meaning = Object.hasOwn(meanings, code) ? meanings[code] : undefined;
  return meaning && translate(language, meaning);
}

/** Every built-in code with a meaning, for translation coverage tests. */
export const ISSUE_CODES = Object.keys(meanings);
