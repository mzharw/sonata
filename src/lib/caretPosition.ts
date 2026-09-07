const MIRROR_PROPERTIES = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "wordSpacing",
  "tabSize",
] as const;

export interface CaretCoordinates {
  top: number;
  left: number;
  height: number;
}

export function getCaretCoordinates(el: HTMLTextAreaElement, position: number): CaretCoordinates {
  const style = getComputedStyle(el);
  const mirror = document.createElement("div");
  for (const prop of MIRROR_PROPERTIES) {
    const cssName = prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    mirror.style.setProperty(cssName, style.getPropertyValue(cssName));
  }
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  document.body.appendChild(mirror);

  mirror.textContent = el.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = el.value.slice(position) || ".";
  mirror.appendChild(marker);

  const rect = el.getBoundingClientRect();
  const top = rect.top + marker.offsetTop - el.scrollTop;
  const left = rect.left + marker.offsetLeft - el.scrollLeft;
  const parsedLineHeight = parseFloat(style.lineHeight);
  const height = marker.offsetHeight || (Number.isFinite(parsedLineHeight) ? parsedLineHeight : 16);

  document.body.removeChild(mirror);
  return { top, left, height };
}
