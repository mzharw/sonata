import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { native } from "../lib/native";
import type { SonataDocument } from "../types/domain";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 800;
const SAVED_BADGE_MS = 1600;

export function useDocumentEditor(id: string | undefined) {
  const qc = useQueryClient();
  const [doc, setDocState] = useState<SonataDocument | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const docRef = useRef<SonataDocument | null>(null);
  const dirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedBadgeRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  docRef.current = doc;

  const persist = async () => {
    const current = docRef.current;
    if (!current || !dirtyRef.current) return;
    dirtyRef.current = false;
    clearTimeout(debounceRef.current);
    setStatus("saving");
    try {
      const saved = await native.updateDocument(current, current.contentHash);
      docRef.current = saved;
      setDocState(saved);
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      setStatus("saved");
      clearTimeout(savedBadgeRef.current);
      savedBadgeRef.current = setTimeout(() => setStatus("idle"), SAVED_BADGE_MS);
    } catch (error) {
      console.error("Autosave failed", error);
      dirtyRef.current = true;
      setStatus("error");
    }
  };

  useEffect(() => {
    dirtyRef.current = false;
    setStatus("idle");
    if (!id) {
      setDocState(null);
      return;
    }
    let cancelled = false;
    void native
      .readDocument(id)
      .then((loaded) => {
        if (!cancelled) setDocState(loaded);
      })
      .catch((error: unknown) => console.error("Failed to load document", id, error));
    return () => {
      cancelled = true;
      clearTimeout(debounceRef.current);
      clearTimeout(savedBadgeRef.current);
      void persist();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const setDoc = (next: SonataDocument) => {
    setDocState(next);
    dirtyRef.current = true;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void persist(), AUTOSAVE_DELAY_MS);
  };

  /**
   * Adopts a document written outside this hook — currently a type conversion, which
   * returns a new `path` and `contentHash`.
   *
   * Deliberately *not* dirty: `update_document` writes to `document.path` verbatim, so a
   * pending autosave holding the pre-conversion path would recreate the file at its old
   * location. Clearing the timer and the dirty flag is what prevents that.
   */
  const replaceDoc = (next: SonataDocument) => {
    dirtyRef.current = false;
    clearTimeout(debounceRef.current);
    docRef.current = next;
    setDocState(next);
  };

  return { doc, setDoc, replaceDoc, status, save: persist };
}
