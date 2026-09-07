import { useQueryClient } from "@tanstack/react-query";
import { native } from "../lib/native";
import { useUi } from "../stores/ui";
import { TYPE_SPECS, describeFields, droppedFields } from "../lib/documentTypes";
import type { DocumentType, SonataDocument } from "../types/domain";

/**
 * Converting a document to another type, from wherever it is offered — a row's type pill,
 * either editor, or the command palette.
 *
 * The confirm/undo split is deliberate and complementary: **confirm before loss, undo when
 * nothing was lost.** A conversion that drops populated fields asks first and then offers
 * no undo, because the values are gone from the Markdown and an undo that silently failed
 * to restore them would be a lie. A lossless conversion asks nothing — a one-click
 * "Triage →" that stops to confirm is not one click — and offers undo, which genuinely
 * restores both the type and the file location.
 */
export function useTypeConversion() {
  const ui = useUi();
  const qc = useQueryClient();

  const apply = async (
    doc: SonataDocument,
    to: DocumentType,
    onApplied?: (updated: SonataDocument) => void,
    { undoable }: { undoable: boolean } = { undoable: true },
  ) => {
    const from = doc.type;
    try {
      const updated = await native.setDocumentType(doc.id, to, doc.contentHash);
      qc.invalidateQueries({ queryKey: ["documents"] });
      // The hover-preview cache holds a document with the old type and path.
      qc.removeQueries({ queryKey: ["preview", doc.id] });
      onApplied?.(updated);
      ui.showToast({
        message: `Converted "${doc.title || "Untitled"}" to ${TYPE_SPECS[to].label}`,
        onUndo: undoable
          ? () => void apply({ ...updated }, from, onApplied, { undoable: false })
          : undefined,
      });
    } catch (error) {
      console.error("Failed to change document type", doc.id, to, error);
      ui.showToast({ message: "Couldn't change the type — see console for details" });
    }
  };

  /**
   * @param doc a row summary or a full document; only `id` is trusted, because a summary
   *   cannot say whether `bookmark` or `stage` are set.
   * @param onApplied receives the converted document. Its `path` and `contentHash` have
   *   changed, so an editor holding it must adopt it via `replaceDoc`.
   */
  const convert = async (
    doc: { id: string },
    to: DocumentType,
    onApplied?: (updated: SonataDocument) => void,
  ) => {
    let full: SonataDocument;
    try {
      full = await native.readDocument(doc.id);
    } catch (error) {
      console.error("Failed to read document before conversion", doc.id, error);
      ui.showToast({ message: "Couldn't change the type — see console for details" });
      return;
    }
    if (full.type === to) return;

    const dropped = droppedFields(full, to);
    if (dropped.length === 0) {
      await apply(full, to, onApplied);
      return;
    }
    ui.requestConfirm({
      message: `Convert "${full.title || "Untitled"}" to ${TYPE_SPECS[to].label}? Its ${describeFields(dropped)} will be removed.`,
      confirmLabel: `Convert to ${TYPE_SPECS[to].label}`,
      onConfirm: () => void apply(full, to, onApplied, { undoable: false }),
    });
  };

  return { convert };
}
