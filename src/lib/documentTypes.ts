import type { ComponentType } from "react";
import { IconInbox, IconCircle, IconNote, IconIdea, IconBookmark } from "../components/icons";
import type { DropdownOption } from "../components/IconDropdown";
import type { View } from "../stores/ui";
import type { DocumentType, SonataDocument } from "../types/domain";

/** A control `DocumentMetaBar` and the Quick Add form can render for a type. */
export type MetaField = "status" | "priority" | "due" | "reminder" | "stage" | "url" | "tags";
/** A chip `DocumentRow` can render in its meta line. */
export type RowChip = "status" | "stage" | "domain" | "tags" | "due" | "progress" | "priority";

export interface TypeSpec {
  /** Repeated inside the entry so a spec can be passed around without its key. */
  type: DocumentType;
  label: string;
  /** View labels and empty states. */
  plural: string;
  icon: ComponentType<{ size?: number; fill?: string }>;
  /** CSS custom property holding this type's accent colour. */
  accentVar: `--type-${string}`;
  /** The view that lists exactly this type. */
  view: View;
  /**
   * Words the Rust capture parser reads as this type. Mirrors `TypeSpec::keywords`
   * (`src-tauri/src/domain/mod.rs`); `documentTypes.test.ts` guards the pair against drift.
   * Empty means the type is not addressable in shorthand.
   */
  keywords: readonly string[];
  /** What Quick Add prepends to force this type; `""` when the Rust default already is it. */
  capturePrefix: string;
  /**
   * Metadata controls, in render order. Also decides which fields survive a conversion —
   * Rust prunes the rest in `SonataDocument::retain_supported_fields`.
   */
  meta: readonly MetaField[];
  /** Row meta chips, in render order. */
  rowChips: readonly RowChip[];
  affordance: "checkbox" | "icon";
  /** Cover image, word count and backlinks: the long-form reading and writing surface. */
  longForm: boolean;
  /** This type answers the Today / Upcoming / Completed views. */
  ownsStatusViews: boolean;
  convertsTo: readonly DocumentType[];
  /** Names the conversion from this type's point of view. */
  convertVerb: string;
}

// `satisfies` rather than an annotation: it proves the object covers `DocumentType`
// exactly — a missing or misspelled key fails to compile right here — while keeping the
// literal key order so `DOCUMENT_TYPES` below is both canonical and provably complete.
const SPECS = {
  inbox: {
    type: "inbox",
    label: "Inbox",
    plural: "Inbox",
    icon: IconInbox,
    accentVar: "--type-inbox",
    view: "inbox",
    keywords: ["inbox"],
    capturePrefix: "",
    // Capture can carry a priority or a due date straight in; status is what an item
    // gains by being triaged into a task.
    meta: ["priority", "due", "tags"],
    rowChips: ["tags", "due", "priority"],
    affordance: "icon",
    longForm: false,
    ownsStatusViews: false,
    convertsTo: ["task", "note", "idea", "bookmark"],
    convertVerb: "Triage",
  },
  task: {
    type: "task",
    label: "Task",
    plural: "Tasks",
    icon: IconCircle,
    accentVar: "--type-task",
    view: "tasks",
    keywords: ["task", "todo"],
    capturePrefix: "task ",
    meta: ["status", "priority", "due", "reminder", "tags"],
    rowChips: ["status", "tags", "due", "progress", "priority"],
    affordance: "checkbox",
    longForm: false,
    ownsStatusViews: true,
    convertsTo: ["note", "idea"],
    convertVerb: "Change type",
  },
  note: {
    type: "note",
    label: "Note",
    plural: "Notes",
    icon: IconNote,
    accentVar: "--type-note",
    view: "notes",
    keywords: ["note"],
    capturePrefix: "note ",
    meta: ["tags"],
    rowChips: ["tags"],
    affordance: "icon",
    longForm: true,
    ownsStatusViews: false,
    convertsTo: ["task", "idea"],
    convertVerb: "Change type",
  },
  idea: {
    type: "idea",
    label: "Idea",
    plural: "Ideas",
    icon: IconIdea,
    accentVar: "--type-idea",
    view: "ideas",
    keywords: ["idea"],
    capturePrefix: "idea ",
    meta: ["stage", "tags"],
    rowChips: ["stage", "tags"],
    affordance: "icon",
    longForm: false,
    ownsStatusViews: false,
    convertsTo: ["task", "note"],
    convertVerb: "Promote",
  },
  bookmark: {
    type: "bookmark",
    label: "Bookmark",
    plural: "Bookmarks",
    icon: IconBookmark,
    accentVar: "--type-bookmark",
    view: "bookmarks",
    keywords: ["bookmark"],
    capturePrefix: "bookmark ",
    meta: ["url", "tags"],
    rowChips: ["domain", "tags"],
    affordance: "icon",
    longForm: false,
    ownsStatusViews: false,
    convertsTo: ["note", "task"],
    convertVerb: "Change type",
  },
} satisfies Record<DocumentType, TypeSpec>;

export const TYPE_SPECS: Record<DocumentType, TypeSpec> = SPECS;
export const DOCUMENT_TYPES = Object.keys(SPECS) as DocumentType[];

export const spec = (type: DocumentType): TypeSpec => TYPE_SPECS[type];

/** Quick capture lands in the inbox, which is what makes triage mean something. */
export const DEFAULT_CAPTURE_TYPE: DocumentType = "inbox";
/** Opening the full-screen editor with nothing to capture means long-form writing. */
export const DEFAULT_FULLSCREEN_TYPE: DocumentType = "note";

/** Inbox is where things land rather than something you make, so it offers last. */
export const CREATABLE_TYPES: DocumentType[] = [
  ...DOCUMENT_TYPES.filter((t) => t !== "inbox"),
  "inbox",
];

/** Every shorthand word the capture parser accepts, canonical spellings first. */
export const TYPE_KEYWORDS: string[] = DOCUMENT_TYPES.flatMap((t) => [...TYPE_SPECS[t].keywords]);

export const typeOptions = (types: readonly DocumentType[] = DOCUMENT_TYPES): DropdownOption[] =>
  types.map((t) => ({
    value: t,
    label: TYPE_SPECS[t].label,
    icon: TYPE_SPECS[t].icon,
    colorVar: TYPE_SPECS[t].accentVar,
  }));

// Key order is the order a warning lists them in, so it is canonical rather than
// incidental: lifecycle first, then scheduling, then the link.
const FIELD_IS_SET: Record<MetaField, (doc: SonataDocument) => boolean> = {
  status: (doc) => doc.status !== undefined,
  stage: (doc) => doc.stage !== undefined,
  // A priority of "none" is what an unset priority looks like once written, so warning
  // about losing it would make almost every conversion read as lossy.
  priority: (doc) => doc.priority !== undefined && doc.priority !== "none",
  due: (doc) => Boolean(doc.due),
  reminder: (doc) => Boolean(doc.reminder),
  url: (doc) => Boolean(doc.bookmark?.url),
  tags: () => false, // Every type accepts tags, so they are never at risk.
};

/**
 * The populated fields `to` does not support — i.e. what a conversion would erase from
 * the Markdown. Empty means the conversion is lossless and can safely be undone.
 */
export function droppedFields(doc: SonataDocument, to: DocumentType): MetaField[] {
  const kept = new Set(TYPE_SPECS[to].meta);
  return (Object.keys(FIELD_IS_SET) as MetaField[]).filter(
    (field) => !kept.has(field) && FIELD_IS_SET[field](doc),
  );
}

const FIELD_LABEL: Record<MetaField, string> = {
  status: "status",
  stage: "stage",
  priority: "priority",
  due: "due date",
  reminder: "reminder",
  url: "link",
  tags: "tags",
};

/** "its due date and priority" — the human half of a conversion warning. */
export const describeFields = (fields: MetaField[]): string =>
  fields.length <= 1
    ? (fields.map((f) => FIELD_LABEL[f])[0] ?? "")
    : `${fields.slice(0, -1).map((f) => FIELD_LABEL[f]).join(", ")} and ${FIELD_LABEL[fields[fields.length - 1]]}`;
