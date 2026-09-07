import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const ResizeHandle = () => {
  const [active, setActive] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number; pointerId: number } | null>(null);
  const pointer = useRef<number | null>(null);
  const latestX = useRef(0);
  const starting = useRef<Promise<void>>(Promise.resolve());
  const ending = useRef(false);
  const pendingWidth = useRef<number | null>(null);
  const resizePromise = useRef<Promise<void> | null>(null);

  const flush = (): Promise<void> => {
    if (resizePromise.current) return resizePromise.current;
    const operation = (async () => {
      await starting.current;
      while (pendingWidth.current !== null) {
        const width = pendingWidth.current;
        pendingWidth.current = null;
        await invoke<void>("resize_sidebar", { width });
      }
    })();
    resizePromise.current = operation.finally(() => {
      resizePromise.current = null;
    });
    return resizePromise.current;
  };

  const queueWidth = (screenX: number) => {
    latestX.current = screenX;
    const current = drag.current;
    if (!current) return;
    pendingWidth.current = Math.max(0, Math.round(
      current.startWidth + (current.startX - screenX) * window.devicePixelRatio,
    ));
  };

  const finish = async () => {
    if (pointer.current === null) return;
    pointer.current = null;
    ending.current = true;
    setActive(false);
    try {
      await starting.current;
      queueWidth(latestX.current);
      drag.current = null;
      await flush();
    } catch (error) {
      console.error("Failed to resize sidebar", error);
    } finally {
      drag.current = null;
      try {
        await invoke<void>("set_sidebar_resizing", { resizing: false });
      } finally {
        ending.current = false;
      }
    }
  };

  return (
    <div
      className={`resize-handle${active ? " is-dragging" : ""}`}
      aria-label="Resize Sonata sidebar"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(event) => {
        if (pointer.current !== null || ending.current || event.button !== 0) return;
        event.preventDefault();
        pointer.current = event.pointerId;
        latestX.current = event.screenX;
        setActive(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        const startX = event.screenX;
        const pointerId = event.pointerId;
        starting.current = (async () => {
          await invoke<void>("set_sidebar_resizing", { resizing: true });
          const size = await getCurrentWindow().outerSize();
          drag.current = { startX, startWidth: size.width, pointerId };
          queueWidth(latestX.current);
        })();
        void flush().catch((error: unknown) => console.error("Failed to resize sidebar", error));
      }}
      onPointerMove={(event) => {
        if (pointer.current !== event.pointerId) return;
        queueWidth(event.screenX);
        void flush().catch((error: unknown) => console.error("Failed to resize sidebar", error));
      }}
      onPointerUp={(event) => {
        if (pointer.current !== event.pointerId) return;
        queueWidth(event.screenX);
        void finish().catch(console.error);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => void finish().catch(console.error)}
      onLostPointerCapture={() => void finish().catch(console.error)}
    />
  );
};
