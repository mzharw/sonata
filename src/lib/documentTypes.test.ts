import { describe, expect, it } from "vitest";
import {
  CREATABLE_TYPES,
  DEFAULT_CAPTURE_TYPE,
  DOCUMENT_TYPES,
  TYPE_KEYWORDS,
  TYPE_SPECS,
  describeFields,
  droppedFields,
  typeOptions,
} from "./documentTypes";
import { sections } from "../features/search/views";
import type { DocumentType, SonataDocument } from "../types/domain";

const doc = (over: Partial<SonataDocument> = {}): SonataDocument => ({
  id: "01ABC",
  path: "inbox/x.md",
  type: "inbox",
  title: "X",
  body: "",
  tags: [],
  created: "",
  updated: "",
  archived: false,
  pinned: false,
  ...over,
});

describe("the type registry", () => {
  it("covers every type exactly once, in canonical order", () => {
    expect(DOCUMENT_TYPES).toEqual(["inbox", "task", "note", "idea", "bookmark"]);
    for (const type of DOCUMENT_TYPES) expect(TYPE_SPECS[type].type).toBe(type);
  });

  // The Rust `TypeSpec::keywords` table is the parser's authority; suggesting a word it
  // does not accept would leave the type word buried in the title.
  it("only claims keywords the Rust capture parser accepts", () => {
    expect([...TYPE_KEYWORDS].sort()).toEqual(
      ["bookmark", "idea", "inbox", "note", "task", "todo"].sort(),
    );
    expect(TYPE_SPECS.task.keywords).toContain("todo");
  });

  it("gives every type a distinct view, accent and capture prefix", () => {
    const views = DOCUMENT_TYPES.map((t) => TYPE_SPECS[t].view);
    expect(new Set(views).size).toBe(views.length);
    const accents = DOCUMENT_TYPES.map((t) => TYPE_SPECS[t].accentVar);
    expect(new Set(accents).size).toBe(accents.length);
    // Only the default capture type needs no prefix, because it is what Rust already does.
    const bare = DOCUMENT_TYPES.filter((t) => TYPE_SPECS[t].capturePrefix === "");
    expect(bare).toEqual([DEFAULT_CAPTURE_TYPE]);
  });

  it("exposes every type's view as a section", () => {
    const listed = sections.map(([view]) => view);
    for (const type of DOCUMENT_TYPES) expect(listed).toContain(TYPE_SPECS[type].view);
  });

  it("never offers a type conversion to itself, and offers each at least one", () => {
    for (const type of DOCUMENT_TYPES) {
      const spec = TYPE_SPECS[type];
      expect(spec.convertsTo).not.toContain(type);
      expect(spec.convertsTo.length).toBeGreaterThan(0);
      expect(new Set(spec.convertsTo).size).toBe(spec.convertsTo.length);
    }
  });

  it("lists no field or chip twice, and tags everywhere", () => {
    for (const type of DOCUMENT_TYPES) {
      const { meta, rowChips } = TYPE_SPECS[type];
      expect(new Set(meta).size).toBe(meta.length);
      expect(new Set(rowChips).size).toBe(rowChips.length);
      expect(meta).toContain("tags");
    }
  });

  it("gives exactly one type the checkbox and the status views", () => {
    expect(DOCUMENT_TYPES.filter((t) => TYPE_SPECS[t].affordance === "checkbox")).toEqual(["task"]);
    expect(DOCUMENT_TYPES.filter((t) => TYPE_SPECS[t].ownsStatusViews)).toEqual(["task"]);
    expect(DOCUMENT_TYPES.filter((t) => TYPE_SPECS[t].longForm)).toEqual(["note"]);
  });

  it("offers inbox last when creating, since that is where things land", () => {
    expect(CREATABLE_TYPES).toHaveLength(DOCUMENT_TYPES.length);
    expect(CREATABLE_TYPES[CREATABLE_TYPES.length - 1]).toBe("inbox");
  });

  it("colours every dropdown option from the type's accent", () => {
    const options = typeOptions();
    expect(options).toHaveLength(DOCUMENT_TYPES.length);
    expect(options.every((o) => o.colorVar && o.icon)).toBe(true);
    expect(typeOptions(["note", "task"]).map((o) => o.value)).toEqual(["note", "task"]);
  });
});

describe("droppedFields", () => {
  it("names what a conversion would erase", () => {
    const task = doc({ type: "task", status: "todo", due: "2026-02-01", priority: "high" });
    expect(droppedFields(task, "note")).toEqual(["status", "priority", "due"]);
    expect(droppedFields(task, "idea")).toEqual(["status", "priority", "due"]);
  });

  it("is empty when nothing populated would be lost", () => {
    expect(droppedFields(doc({ tags: ["work"] }), "note")).toEqual([]);
    // A stored "none" priority is what an unset priority looks like, so it is not a loss.
    expect(droppedFields(doc({ priority: "none" }), "note")).toEqual([]);
  });

  it("counts a bookmark's url as lost when the target has no url field", () => {
    const link = doc({ type: "bookmark", bookmark: { url: "https://example.com" } });
    expect(droppedFields(link, "note")).toEqual(["url"]);
    expect(droppedFields(link, "bookmark")).toEqual([]);
  });

  it("counts an idea's stage as lost outside the idea type", () => {
    expect(droppedFields(doc({ type: "idea", stage: "developing" }), "task")).toEqual(["stage"]);
  });

  it("never reports tags, which every type accepts", () => {
    for (const type of DOCUMENT_TYPES) {
      expect(droppedFields(doc({ tags: ["a", "b"] }), type as DocumentType)).not.toContain("tags");
    }
  });
});

describe("describeFields", () => {
  it("reads as a sentence fragment", () => {
    expect(describeFields([])).toBe("");
    expect(describeFields(["due"])).toBe("due date");
    expect(describeFields(["due", "priority"])).toBe("due date and priority");
    expect(describeFields(["status", "due", "priority"])).toBe("status, due date and priority");
  });
});
