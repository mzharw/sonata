import type { ComponentType } from "react";
import { IconInbox, IconCircle, IconNote, IconIdea, IconBookmark } from "../components/icons";
import type { DocumentType } from "../types/domain";

export const TYPE_ICON: Record<DocumentType, ComponentType<{ size?: number; fill?: string }>> = {
  inbox: IconInbox,
  task: IconCircle,
  note: IconNote,
  idea: IconIdea,
  bookmark: IconBookmark,
};

export const TYPE_LABEL: Record<DocumentType, string> = {
  inbox: "Inbox",
  task: "Task",
  note: "Note",
  idea: "Idea",
  bookmark: "Bookmark",
};
