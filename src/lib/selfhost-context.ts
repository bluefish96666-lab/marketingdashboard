import { createContext, useContext } from "react";

export const SelfhostContext = createContext(false);

export function useSelfhost(): boolean {
  return useContext(SelfhostContext);
}
