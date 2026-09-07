import { useState } from "react";
import type { SonataDocument } from "../types/domain";
import { native } from "../lib/native";
import { IconImagePlus } from "./icons";

export function AttachmentButton({ doc, onChange, onNotice, className }: { doc: SonataDocument; onChange: (doc: SonataDocument) => void; onNotice: (message: string) => void; className?: string }) {
  const [importing, setImporting] = useState(false);

  const attach = async () => {
    try {
      const selected = await native.chooseCoverImage();
      if (selected === null) return;
      const sourcePath = Array.isArray(selected) ? selected[0] : selected;
      if (!sourcePath) return;
      setImporting(true);
      const attachment = await native.importAttachment(doc.id, sourcePath);
      onChange({ ...doc, cover: attachment.path });
      onNotice("Cover image updated");
    } catch (error) {
      console.error("Couldn't attach file", error);
      onNotice("Couldn't attach file — see console for details");
    } finally {
      setImporting(false);
    }
  };

  return (
    <button type="button" className={`icon-btn ${className ?? ""}`} aria-label="Attach file and set image as cover" title="Attach file — images become the cover" onClick={() => void attach()} disabled={importing}>
      <IconImagePlus size={15} />
    </button>
  );
}
