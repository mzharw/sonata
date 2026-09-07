import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...props }: IconProps) {
  return { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...props };
}

export const IconPlus = (props: IconProps) => <svg {...base(props)}><path d="M12 5v14M5 12h14" /></svg>;
export const IconSearch = (props: IconProps) => <svg {...base(props)}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;
export const IconChevronDown = (props: IconProps) => <svg {...base(props)}><path d="m6 9 6 6 6-6" /></svg>;
export const IconChevronUp = (props: IconProps) => <svg {...base(props)}><path d="m6 15 6-6 6 6" /></svg>;
export const IconCheck = (props: IconProps) => <svg {...base(props)}><path d="M20 6 9 17l-5-5" /></svg>;
export const IconCircle = (props: IconProps) => <svg {...base(props)}><circle cx="12" cy="12" r="8" /></svg>;
export const IconDot = (props: IconProps) => <svg {...base(props)}><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" /></svg>;
export const IconArchive = (props: IconProps) => <svg {...base(props)}><rect x="3" y="4" width="18" height="5" rx="1.5" /><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" /></svg>;
export const IconTrash = (props: IconProps) => <svg {...base(props)}><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7" /></svg>;
export const IconCommand = (props: IconProps) => <svg {...base(props)}><path d="M9 3a3 3 0 1 0 3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" /></svg>;
export const IconRefresh = (props: IconProps) => <svg {...base(props)}><path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" /></svg>;
export const IconMaximize = (props: IconProps) => <svg {...base(props)}><path d="M9 3H3v6M15 3h6v6M21 15v6h-6M3 15v6h6" /></svg>;
export const IconArrowLeft = (props: IconProps) => <svg {...base(props)}><path d="M19 12H5M11 5l-7 7 7 7" /></svg>;
export const IconCalendar = (props: IconProps) => <svg {...base(props)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>;
export const IconX = (props: IconProps) => <svg {...base(props)}><path d="M18 6 6 18M6 6l12 12" /></svg>;
export const IconNote = (props: IconProps) => <svg {...base(props)}><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v4h4M8.5 12h7M8.5 16h5" /></svg>;
export const IconIdea = (props: IconProps) => <svg {...base(props)}><path d="M9 18h6M10 21h4M8 14a5 5 0 1 1 8 0c-.8.8-1.3 1.4-1.5 2.2a1 1 0 0 1-1 .8h-2a1 1 0 0 1-1-.8c-.2-.8-.7-1.4-1.5-2.2Z" /></svg>;
export const IconBookmark = (props: IconProps) => <svg {...base(props)}><path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4Z" /></svg>;
export const IconInbox = (props: IconProps) => <svg {...base(props)}><path d="M4 12h4l2 3h4l2-3h4" /><path d="M5.5 5h13l1.5 7v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Z" /></svg>;
export const IconPin = (props: IconProps) => <svg {...base(props)}><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6Z" /><path d="M12 15v5" /></svg>;
export const IconFlag = (props: IconProps) => <svg {...base(props)}><path d="M5 3v18" /><path d="M5 4h11l-2.5 4L16 12H5Z" /></svg>;
export const IconFilter = (props: IconProps) => <svg {...base(props)}><path d="M4 7h16M7 12h10M10 17h4" /></svg>;
export const IconCircleDot = (props: IconProps) => <svg {...base(props)}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></svg>;
export const IconChevronLeft = (props: IconProps) => <svg {...base(props)}><path d="m15 6-6 6 6 6" /></svg>;
export const IconChevronRight = (props: IconProps) => <svg {...base(props)}><path d="m9 6 6 6-6 6" /></svg>;
export const IconFolder = (props: IconProps) => <svg {...base(props)}><path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /></svg>;
export const IconBold = (props: IconProps) => <svg {...base(props)}><path d="M6 4h7a3.5 3.5 0 0 1 0 7H6ZM6 11h8a3.5 3.5 0 0 1 0 7H6Z" /></svg>;
export const IconItalic = (props: IconProps) => <svg {...base(props)}><path d="M11 4h6M5 20h6M14 4 8 20" /></svg>;
export const IconStrikethrough = (props: IconProps) => <svg {...base(props)}><path d="M4 12h16M7 7c0-2 2-3.5 5-3.5s5 1.2 5 3M8 17c0 2 2 3.5 5 3.5s4-1 4-2.8" /></svg>;
export const IconInlineCode = (props: IconProps) => <svg {...base(props)}><path d="m9 8-4 4 4 4M15 8l4 4-4 4" /></svg>;
export const IconLink = (props: IconProps) => <svg {...base(props)}><path d="M9 15 15 9M10 6l1.5-1.5a4 4 0 1 1 5.7 5.7L15.5 12M14 18l-1.5 1.5a4 4 0 1 1-5.7-5.7L8.5 12" /></svg>;
export const IconHeading = (props: IconProps) => <svg {...base(props)}><path d="M6 5v14M18 5v14M6 12h12" /></svg>;
export const IconListBullets = (props: IconProps) => <svg {...base(props)}><circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" /><path d="M9 6h11M9 12h11M9 18h11" /></svg>;
export const IconListNumbers = (props: IconProps) => <svg {...base(props)}><path d="M9 6h11M9 12h11M9 18h11M4 4.5v3M4 4.5h1M3.5 10.5h1.3l-1.3 1.6h1.5M4 17h.01M4 20h.01" /></svg>;
export const IconQuote = (props: IconProps) => <svg {...base(props)}><path d="M7 8a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3M17 8a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3" /></svg>;
export const IconEye = (props: IconProps) => <svg {...base(props)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>;
export const IconPencilLine = (props: IconProps) => <svg {...base(props)}><path d="M4 20h16" /><path d="M14.5 4.5 18 8 8 18H4.5v-3.5Z" /></svg>;
export const IconPencil = (props: IconProps) => <svg {...base(props)}><path d="M14.5 4.5 18 8 8 18H4.5v-3.5Z" /></svg>;
export const IconImagePlus = (props: IconProps) => <svg {...base(props)}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 5-5 3.5 3.5 2.5-2.5L20 18M17 7v4M15 9h4" /></svg>;
// Status glyphs are self-contained: sub-shapes hardcode their own fill so callers can safely
// pass fill="currentColor" (e.g. IconDropdown does this for any option with a colorVar) without
// turning an open stroke path (like a checkmark) into a filled wedge blob.
export const IconStatusTodo = (props: IconProps) => <svg {...base(props)}><circle cx="12" cy="12" r="8" fill="none" /></svg>;
export const IconStatusProgress = (props: IconProps) => <svg {...base(props)}><circle cx="12" cy="12" r="8" fill="none" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" /></svg>;
export const IconStatusDone = (props: IconProps) => <svg {...base(props)}><circle cx="12" cy="12" r="8" fill="none" /><path d="M8.5 12.3 11 15l4.5-6" fill="none" /></svg>;
export const IconCodeBlock = (props: IconProps) => <svg {...base(props)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m9 10-2 2 2 2M15 10l2 2-2 2" /></svg>;
export const IconMinus = (props: IconProps) => <svg {...base(props)}><path d="M5 12h14" /></svg>;
export const IconCheckSquare = (props: IconProps) => <svg {...base(props)}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12.5 2.5 2.5 5-5" /></svg>;
export const IconTable = (props: IconProps) => <svg {...base(props)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 16h18M9 4v16" /></svg>;
export const IconHelp = (props: IconProps) => <svg {...base(props)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.3a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" /><circle cx="12" cy="17" r=".1" fill="currentColor" stroke="currentColor" /></svg>;
export const IconFileText = (props: IconProps) => <svg {...base(props)}><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v4h4M8.5 12h7M8.5 15.5h7M8.5 8.5h3" /></svg>;
export const IconMarkdown = (props: IconProps) => <svg {...base(props)}><rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M6 15.5v-7l3 3 3-3v7M17 8.5v7M14.5 13l2.5 2.5 2.5-2.5" /></svg>;
export const IconCopy = (props: IconProps) => <svg {...base(props)}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M6 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2" /></svg>;
