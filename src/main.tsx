import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { ResizeHandle } from "./components/ResizeHandle";
import App from "./app/App";
import { WorkspaceGate } from "./app/WorkspaceGate";
import "./styles/index.css";
import "./styles/resize-handle.css";
import "./styles/viewport.css";


const BlockWebViewShortcuts = () => {
  useEffect(() => {
    const blockBrowserShortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const blocked =
        (event.ctrlKey && ["p", "r", "f", "l", "+", "-", "=", "0"].includes(key)) ||
        (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key)) ||
        event.key === "F5" || event.key === "F12";
      if (blocked) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", blockBrowserShortcut, true);
    return () => {
      window.removeEventListener("keydown", blockBrowserShortcut, true);
    };
  }, []);
  return null;
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      {isTauri() && <ResizeHandle />}
      {isTauri() && <BlockWebViewShortcuts />}
      <WorkspaceGate><App /></WorkspaceGate>
    </QueryClientProvider>
  </StrictMode>,
);
