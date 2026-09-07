import { native } from "./native";
import type { SonataDocument } from "../types/domain";

export async function chooseAndImportAttachment(documentId: string) {
  const selected = await native.chooseAttachment();
  if (selected === null) return null;
  const sourcePath = Array.isArray(selected) ? selected[0] : selected;
  return sourcePath ? native.importAttachment(documentId, sourcePath) : null;
}

function base64Encode(bytes: Uint8Array) {
  let binary = "";
  // Keep each conversion below the argument-limit of WebViews with smaller
  // stacks, while still avoiding an unnecessary data-URL copy.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

/** Copies a pasted image into the workspace so its Markdown reference stays portable. */
export async function importClipboardImage(documentId: string, image: File) {
  if (!image.type.startsWith("image/")) throw new Error("Clipboard item is not an image");
  return native.importClipboardImage(documentId, image.type, base64Encode(new Uint8Array(await image.arrayBuffer())));
}

/** Adds an ordinary, portable Markdown reference without changing the note cover. */
export function attachToDocument(doc: SonataDocument, attachment: { path: string; name: string; mediaType: string }) {
  const isImage = attachment.mediaType.startsWith("image/");
  const reference = isImage ? `![${attachment.name}](${attachment.path})` : `[${attachment.name}](${attachment.path})`;
  return { ...doc, body: `${doc.body.trimEnd()}${doc.body.trim() ? "\n\n" : ""}${reference}\n` };
}
