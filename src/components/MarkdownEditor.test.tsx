// @vitest-environment jsdom
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";

afterEach(() => cleanup());

function setup(value = "", onChange = vi.fn()) {
  render(<MarkdownEditor value={value} onChange={onChange} ariaLabel="Note body" placeholder="Click to write…" />);
  return { onChange };
}

/** Mimics how DocumentRow/FullScreenEditor drive the raw-toggle externally via the imperative handle. */
function ExternalToggleHarness({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<MarkdownEditorHandle>(null);
  const [raw, setRaw] = useState(false);
  return (
    <>
      <button aria-label={raw ? "Back to block view" : "Edit whole document as text"} onClick={() => ref.current?.toggleRaw()} />
      <MarkdownEditor ref={ref} value={value} onChange={onChange} ariaLabel="Note body" placeholder="Click to write…" onRawChange={setRaw} />
    </>
  );
}

describe("MarkdownEditor", () => {
  it("shows the placeholder in preview mode when empty", () => {
    setup("");
    expect(screen.getByText("This note is empty")).toBeTruthy();
    expect(screen.getByText("Click to write…")).toBeTruthy();
    expect(screen.queryByLabelText("Note body")).toBeNull();
  });

  it("treats whitespace-only content as empty too, not as renderable markdown", () => {
    setup("   \n\n  ");
    expect(screen.getByText("This note is empty")).toBeTruthy();
    expect(document.querySelector(".md-prose")).toBeNull();
  });

  it("offers quick-start chips on the empty placeholder that seed content and jump straight into editing", () => {
    const { onChange } = setup("");
    fireEvent.click(screen.getByRole("button", { name: "Bullet list" }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    expect(textarea.value).toBe("- ");
    expect(onChange).toHaveBeenLastCalledWith("- ");
  });

  it("renders markdown as HTML in preview mode", () => {
    setup("**bold** and _italic_");
    const strong = document.querySelector(".md-prose strong");
    const em = document.querySelector(".md-prose em");
    expect(strong?.textContent).toBe("bold");
    expect(em?.textContent).toBe("italic");
  });

  it("resolves a workspace attachment image to its native data URL", () => {
    render(<MarkdownEditor value="![Cover](attachments/01ABC/cover.png)" attachmentUrls={{ "attachments/01ABC/cover.png": "data:image/png;base64,aGVsbG8=" }} onChange={vi.fn()} ariaLabel="Note body" />);
    expect(document.querySelector(".md-prose img")?.getAttribute("src")).toBe("data:image/png;base64,aGVsbG8=");
  });

  it("opens a local attachment link through the native explorer callback", () => {
    const onOpenAttachment = vi.fn();
    render(<MarkdownEditor value="[Report](attachments/01ABC/report.pdf)" onChange={vi.fn()} onOpenAttachment={onOpenAttachment} ariaLabel="Note body" />);
    fireEvent.click(screen.getByRole("link", { name: "Report" }));
    expect(onOpenAttachment).toHaveBeenCalledWith("attachments/01ABC/report.pdf");
  });

  it("opens an external link through the supplied native callback without activating the editor", () => {
    const onOpenExternal = vi.fn();
    render(<MarkdownEditor value="[Sonata](https://example.com)" onChange={vi.fn()} onOpenExternal={onOpenExternal} ariaLabel="Note body" />);
    fireEvent.click(screen.getByRole("link", { name: "Sonata" }));
    expect(onOpenExternal).toHaveBeenCalledWith("https://example.com");
    expect(screen.queryByLabelText("Note body")).toBeNull();
  });

  it("opens a stable wiki link inside Sonata", () => {
    const onOpenDocument = vi.fn();
    render(<MarkdownEditor value="[[Related|01ARZ3NDEKTSV4RRFFQ69G5FAV]]" onChange={vi.fn()} onOpenDocument={onOpenDocument} ariaLabel="Note body" />);
    fireEvent.click(screen.getByRole("link", { name: "Related" }));
    expect(onOpenDocument).toHaveBeenCalledWith("01ARZ3NDEKTSV4RRFFQ69G5FAV");
  });

  it("strips dangerous attributes instead of executing them", () => {
    setup('<img src=x onerror="window.__pwned=true">hello');
    const img = document.querySelector(".md-prose img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("onerror")).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it("switches to edit mode on click and shows the toolbar", () => {
    setup("hello world");
    fireEvent.click(screen.getByRole("button", { name: "Edit Note body" }));
    expect(screen.getByLabelText("Note body")).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeTruthy();
  });

  it("switches back to preview on blur", () => {
    setup("hello world");
    fireEvent.click(screen.getByRole("button", { name: "Edit Note body" }));
    fireEvent.blur(screen.getByLabelText("Note body"));
    expect(screen.queryByLabelText("Note body")).toBeNull();
  });

  it("bold toolbar button wraps the current selection with **", () => {
    const { onChange } = setup("hello world");
    fireEvent.click(screen.getByRole("button", { name: "Edit Note body" }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 5);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(onChange).toHaveBeenCalledWith("**hello** world");
  });

  it("Ctrl+B applies bold via keyboard shortcut", () => {
    const { onChange } = setup("hello world");
    fireEvent.click(screen.getByRole("button", { name: "Edit Note body" }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    textarea.setSelectionRange(6, 11);
    fireEvent.keyDown(textarea, { key: "b", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith("hello **world**");
  });

  it("Escape in edit mode returns to preview without bubbling to ancestors", () => {
    setup("hello world");
    fireEvent.click(screen.getByRole("button", { name: "Edit Note body" }));
    const textarea = screen.getByLabelText("Note body");
    const bubbled = vi.fn();
    document.addEventListener("keydown", bubbled);
    fireEvent.keyDown(textarea, { key: "Escape" });
    document.removeEventListener("keydown", bubbled);
    expect(screen.queryByLabelText("Note body")).toBeNull();
    expect(bubbled).not.toHaveBeenCalled();
  });

  it("renders each paragraph as an independently-activatable block, leaving the rest in preview", () => {
    setup("First paragraph.\n\nSecond paragraph.");
    // paragraph, the blank-line gap between them, and the second paragraph
    const blocks = screen.getAllByRole("button", { name: "Edit Note body" });
    expect(blocks).toHaveLength(3);
    fireEvent.click(blocks[2]);
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Second paragraph.");
    // the first paragraph is still shown as rendered, frozen context, not a textarea
    expect(document.querySelector(".md-block-frozen")?.textContent).toContain("First paragraph.");
  });

  it("editing one block and blurring rebuilds the full document with the other block untouched", () => {
    const { onChange } = setup("First paragraph.\n\nSecond paragraph.");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit Note body" })[2]);
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Second paragraph, edited." } });
    expect(onChange).toHaveBeenLastCalledWith("First paragraph.\n\nSecond paragraph, edited.");
  });

  it("renders the blank line between two paragraphs as its own small clickable, editable gap", () => {
    const { onChange } = setup("First paragraph.\n\nSecond paragraph.");
    const gap = screen.getAllByRole("button", { name: "Edit Note body" })[1];
    expect(gap.className).toContain("md-block-space");
    fireEvent.click(gap);
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "\n> inserted in the gap\n\n" } });
    expect(onChange).toHaveBeenLastCalledWith("First paragraph.\n> inserted in the gap\n\nSecond paragraph.");
  });

  it("Ctrl+2 toggles a heading 2 on the current line", () => {
    const { onChange } = setup("hello world");
    fireEvent.click(screen.getByRole("button", { name: "Edit Note body" }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: "2", code: "Digit2", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith("## hello world");
  });

  it("Tab indents the current line", () => {
    const { onChange } = setup("- item");
    fireEvent.click(screen.getByRole("button", { name: "Edit Note body" }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: "Tab" });
    expect(onChange).toHaveBeenCalledWith("  - item");
  });

  it("Enter continues a bullet list item", () => {
    const { onChange } = setup("- item one");
    fireEvent.click(screen.getByRole("button", { name: "Edit Note body" }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("- item one\n- ");
  });

  it("Enter on an empty list item exits the list instead of continuing it", () => {
    const { onChange } = setup("- item one\n- ");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit Note body" })[0]);
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("- item one\n");
  });

  it("typing / opens the shorthand menu and Enter inserts the highlighted command", () => {
    const { onChange } = setup("");
    fireEvent.click(screen.getByRole("button", { name: /Edit Note body/ }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "/head" } });
    expect(screen.getByRole("listbox", { name: "Insert block" })).toBeTruthy();
    expect(screen.getByText("Heading 1")).toBeTruthy();
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("# ");
  });

  it("opens the shorthand menu for a / typed mid-line, not just at the start of one", () => {
    const { onChange } = setup("");
    fireEvent.click(screen.getByRole("button", { name: /Edit Note body/ }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Shopping list /bullet" } });
    expect(screen.getByRole("listbox", { name: "Insert block" })).toBeTruthy();
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("- Shopping list ");
  });

  it("opens the shorthand menu after a list marker", () => {
    setup("");
    fireEvent.click(screen.getByRole("button", { name: /Edit Note body/ }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "- /code" } });
    expect(screen.getByRole("listbox", { name: "Insert block" })).toBeTruthy();
    expect(screen.getByText("Code block")).toBeTruthy();
  });

  it("leaves a / inside a word alone, so URLs and paths don't pop the menu open", () => {
    setup("");
    fireEvent.click(screen.getByRole("button", { name: /Edit Note body/ }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "see https://example.com" } });
    expect(screen.queryByRole("listbox", { name: "Insert block" })).toBeNull();
    fireEvent.change(textarea, { target: { value: "src/lib" } });
    expect(screen.queryByRole("listbox", { name: "Insert block" })).toBeNull();
  });

  it("closes the shorthand menu when the caret moves off the /", () => {
    setup("");
    fireEvent.click(screen.getByRole("button", { name: /Edit Note body/ }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "/head" } });
    expect(screen.getByRole("listbox", { name: "Insert block" })).toBeTruthy();
    textarea.setSelectionRange(0, 0);
    fireEvent.select(textarea);
    expect(screen.queryByRole("listbox", { name: "Insert block" })).toBeNull();
  });

  it("exposes a toggleRaw imperative handle so a caller can switch to whole-document editing and back", () => {
    render(<ExternalToggleHarness value={"First paragraph.\n\nSecond paragraph."} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit whole document as text" }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    expect(textarea.value).toBe("First paragraph.\n\nSecond paragraph.");
    fireEvent.click(screen.getByRole("button", { name: "Back to block view" }));
    expect(screen.getAllByRole("button", { name: "Edit Note body" })).toHaveLength(3);
  });

  it("falls back to whole-document editing (no block splitting) when it can't safely track block boundaries, e.g. CRLF line endings", () => {
    const { onChange } = setup("para one\r\npara two");
    // exactly one clickable region, not per-block, since splitting isn't provably safe here
    expect(screen.getAllByRole("button", { name: "Edit Note body" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Edit Note body" }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "para one edited\npara two" } });
    expect(onChange).toHaveBeenCalledWith("para one edited\npara two");
  });

  it("the code block slash command wraps the cursor in a fenced code block", () => {
    const { onChange } = setup("");
    fireEvent.click(screen.getByRole("button", { name: /Edit Note body/ }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "/code" } });
    fireEvent.click(screen.getByText("Code block"));
    expect(onChange).toHaveBeenLastCalledWith("```\n\n```");
  });

  it("opens the attachment picker from the slash menu and removes the command text", () => {
    const onAttach = vi.fn();
    const onChange = vi.fn();
    render(<MarkdownEditor value="" onChange={onChange} onAttach={onAttach} ariaLabel="Note body" />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Note body/ }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "/attach" } });
    fireEvent.click(screen.getByText("Attach file"));
    expect(onAttach).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("imports a pasted clipboard image and inserts its portable Markdown reference at the cursor", async () => {
    const onChange = vi.fn();
    const onPasteImage = vi.fn().mockResolvedValue({ name: "clipboard-image.png", path: "attachments/id/clipboard-image.png", mediaType: "image/png" });
    render(<MarkdownEditor value="Before after" onChange={onChange} onPasteImage={onPasteImage} ariaLabel="Note body" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Note body" }));
    const textarea = screen.getByLabelText("Note body") as HTMLTextAreaElement;
    textarea.setSelectionRange(7, 7);
    const image = new File(["image"], "clipboard.png", { type: "image/png" });
    fireEvent.paste(textarea, { clipboardData: { files: [image], items: [] } });
    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith("Before ![clipboard-image.png](attachments/id/clipboard-image.png)after"));
    expect(onPasteImage).toHaveBeenCalledWith(image);
  });

  it("leaves the note unchanged when clipboard image import fails", async () => {
    const onChange = vi.fn();
    const onPasteImage = vi.fn().mockRejectedValue(new Error("no workspace"));
    render(<MarkdownEditor value="Keep" onChange={onChange} onPasteImage={onPasteImage} ariaLabel="Note body" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Note body" }));
    const textarea = screen.getByLabelText("Note body");
    fireEvent.paste(textarea, { clipboardData: { files: [new File(["image"], "clipboard.png", { type: "image/png" })], items: [] } });
    await vi.waitFor(() => expect(onPasteImage).toHaveBeenCalledOnce());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders task-list checkboxes enabled (not marked's default disabled) so they're clickable straight from preview", () => {
    setup("- [ ] task one\n- [x] task two");
    const boxes = document.querySelectorAll<HTMLInputElement>('.md-prose input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect(boxes[0].disabled).toBe(false);
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
  });

  it("clicking a task checkbox toggles that line in the source without entering edit mode", () => {
    const { onChange } = setup("- [ ] task one\n- [x] task two");
    const boxes = document.querySelectorAll<HTMLInputElement>('.md-prose input[type="checkbox"]');
    fireEvent.click(boxes[0]);
    expect(onChange).toHaveBeenCalledWith("- [x] task one\n- [x] task two");
    expect(screen.queryByLabelText("Note body")).toBeNull();
  });

  it("clicking the second task checkbox toggles only that item", () => {
    const { onChange } = setup("- [ ] task one\n- [x] task two");
    const boxes = document.querySelectorAll<HTMLInputElement>('.md-prose input[type="checkbox"]');
    fireEvent.click(boxes[1]);
    expect(onChange).toHaveBeenCalledWith("- [ ] task one\n- [ ] task two");
  });

});
