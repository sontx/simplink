import { useEffect, useState } from "react";
import Editor, { loader, type EditorProps } from "@monaco-editor/react";
import type { NodeType } from "@sontx/simplink-core";
import * as monaco from "monaco-editor/editor/editor.api.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import {
  conf,
  language,
} from "monaco-editor/languages/definitions/markdown/markdown.js";
import "monaco-editor/languages/definitions/yaml/register.js";
import "monaco-editor/editor/contrib/suggest/browser/suggestController.js";
import "monaco-editor/editor/contrib/hover/browser/hoverContribution.js";
import {
  completeFrontmatter,
  validateFrontmatter,
} from "../lib/frontmatter.js";

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

const languageId = "simplink-markdown";
const modelTypes = new WeakMap<monaco.editor.ITextModel, NodeType>();
monaco.languages.register({ id: languageId });
monaco.languages.setLanguageConfiguration(languageId, conf);
monaco.languages.setMonarchTokensProvider(languageId, {
  ...language,
  start: "frontmatterStart",
  tokenizer: {
    ...language.tokenizer,
    frontmatterStart: [
      [
        /^\uFEFF?---[^\S\r\n]*$/,
        {
          token: "meta.separator",
          switchTo: "@frontmatter",
          nextEmbedded: "yaml",
        },
      ],
      [/.*/, { token: "@rematch", switchTo: "@root" }],
    ],
    frontmatter: [
      [
        /^---[^\S\r\n]*$/,
        { token: "meta.separator", switchTo: "@root", nextEmbedded: "@pop" },
      ],
      [/./, ""],
    ],
  },
});

function modelRange(
  model: monaco.editor.ITextModel,
  start: number,
  end: number,
) {
  const from = model.getPositionAt(start);
  const to = model.getPositionAt(end);
  return new monaco.Range(
    from.lineNumber,
    from.column,
    to.lineNumber,
    to.column,
  );
}

monaco.languages.registerCompletionItemProvider(languageId, {
  triggerCharacters: [":", " "],
  provideCompletionItems(model, position) {
    const type = modelTypes.get(model);
    return {
      suggestions: type
        ? completeFrontmatter(
            model.getValue(),
            model.getOffsetAt(position),
            type,
          ).map((item) => ({
            label: item.label,
            insertText: item.insertText,
            detail: item.detail,
            kind:
              item.kind === "property"
                ? monaco.languages.CompletionItemKind.Field
                : monaco.languages.CompletionItemKind.EnumMember,
            range: modelRange(model, item.start, item.end),
          }))
        : [],
    };
  },
});

export default function SourceEditor({
  nodeType,
  onMount,
  ...props
}: EditorProps & { nodeType: NodeType }) {
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor>();
  useEffect(() => {
    const model = editor?.getModel();
    if (!model) return;
    modelTypes.set(model, nodeType);
    const validate = () => {
      if (model.isDisposed()) return;
      monaco.editor.setModelMarkers(
        model,
        "frontmatter",
        validateFrontmatter(model.getValue(), nodeType).map((item) => ({
          ...modelRange(model, item.start, item.end),
          message: item.message,
          severity: monaco.MarkerSeverity.Error,
          source: "Frontmatter",
        })),
      );
    };
    let timer: ReturnType<typeof setTimeout>;
    const listener = model.onDidChangeContent(() => {
      clearTimeout(timer);
      timer = setTimeout(validate, 200);
    });
    validate();
    return () => {
      clearTimeout(timer);
      listener.dispose();
      modelTypes.delete(model);
      if (!model.isDisposed())
        monaco.editor.setModelMarkers(model, "frontmatter", []);
    };
  }, [editor, nodeType]);
  return (
    <Editor
      {...props}
      language={languageId}
      onMount={(instance, api) => {
        setEditor(instance);
        onMount?.(instance, api);
      }}
    />
  );
}
