import { createContext, useContext } from "react";
import type { UiMode } from "./ui-mode";

export interface UiModeCtx {
  mode: UiMode;
  setMode: (m: UiMode) => void;
}

export const UiModeContext = createContext<UiModeCtx>({ mode: "classic", setMode: () => {} });

export function useUiModeContext(): UiModeCtx {
  return useContext(UiModeContext);
}
