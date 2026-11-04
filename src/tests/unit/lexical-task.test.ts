import { expect, it } from "vitest";
import { createEditor, $getRoot } from "lexical";
import { $convertFromMarkdownString, $convertToMarkdownString, BOLD_ITALIC_STAR, BOLD_STAR, ITALIC_STAR } from "@lexical/markdown";

it("recupera texto e formatação da descrição salva", () => {
  const editor = createEditor({ onError: error => { throw error; } });
  const transformers = [BOLD_ITALIC_STAR, BOLD_STAR, ITALIC_STAR];
  editor.update(() => {
    $convertFromMarkdownString("Solicitar **documentos** e *revisar*.", transformers);
  }, { discrete: true });
  editor.getEditorState().read(() => {
    expect($getRoot().getTextContent()).toBe("Solicitar documentos e revisar.");
    expect($convertToMarkdownString(transformers, undefined, true)).toBe("Solicitar **documentos** e *revisar*.");
  });
});
