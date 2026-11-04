"use client";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $convertFromMarkdownString, $convertToMarkdownString, BOLD_ITALIC_STAR, BOLD_STAR, ITALIC_STAR } from "@lexical/markdown";
import { FORMAT_TEXT_COMMAND, UNDO_COMMAND, REDO_COMMAND } from "lexical";

const transformers = [BOLD_ITALIC_STAR, BOLD_STAR, ITALIC_STAR];

function Toolbar() {
  const [editor] = useLexicalComposerContext();
  return <div className="flex gap-2 border-b border-border p-2" role="toolbar" aria-label="Formatação">
    <button type="button" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}>Negrito</button>
    <button type="button" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}>Itálico</button>
    <button type="button" onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>Desfazer</button>
    <button type="button" onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>Refazer</button>
  </div>;
}

export function TaskDescription({ initial, onChange, readOnly = false }: {
  initial: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  return <LexicalComposer initialConfig={{
    namespace: "TaskDescription",
    editable: !readOnly,
    theme: { text: { bold: "font-bold", italic: "italic" } },
    editorState: () => $convertFromMarkdownString(initial, transformers, undefined, true),
    onError: (error) => { throw error; },
  }}>
    <div className={readOnly ? "" : "rounded border border-border"}>
      {!readOnly ? <Toolbar /> : null}
      <RichTextPlugin
        contentEditable={<ContentEditable id={readOnly ? undefined : "description"} aria-label="Descrição" className="min-h-24 whitespace-pre-wrap p-3 outline-none focus:ring-2 focus:ring-primary" />}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      {onChange ? <OnChangePlugin ignoreSelectionChange onChange={state => state.read(() => onChange($convertToMarkdownString(transformers, undefined, true)))} /> : null}
    </div>
  </LexicalComposer>;
}
