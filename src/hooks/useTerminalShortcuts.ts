import { useEffect } from "react";
import { isTv } from "@/lib/tv";

/** GMT 风格键盘快捷键(F1/E/I/Esc); TV 模式不占用 */
export function useTerminalShortcuts(handlers: {
  toggleHelp: () => void;
  toggleEditMode: () => void;
  toggleInspector: () => void;
  closeOverlays: () => void;
}) {
  useEffect(() => {
    if (isTv) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "F1") {
        e.preventDefault();
        handlers.toggleHelp();
      } else if (e.key === "e" || e.key === "E") {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        handlers.toggleEditMode();
      } else if (e.key === "i" || e.key === "I") {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        handlers.toggleInspector();
      } else if (e.key === "Escape") {
        handlers.closeOverlays();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}
