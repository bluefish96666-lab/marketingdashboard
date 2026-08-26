import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { presetById, type LayoutPresetId } from "@/config/layout-presets";

interface TerminalCtx {
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  toggleEditMode: () => void;
  inspectorOpen: boolean;
  setInspectorOpen: (v: boolean) => void;
  toggleInspector: () => void;
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
  toggleHelp: () => void;
  selectedPanelId: string | null;
  selectPanel: (id: string | null) => void;
  preset: LayoutPresetId;
  setPreset: (id: LayoutPresetId) => void;
  hiddenPanelIds: Set<string>;
  focusPanelId: string | null;
}

const TerminalContext = createContext<TerminalCtx | null>(null);

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [editMode, setEditMode] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [preset, setPreset] = useState<LayoutPresetId>("full");

  const presetDef = useMemo(() => presetById(preset), [preset]);
  const hiddenPanelIds = useMemo(() => new Set(presetDef.hidden), [presetDef.hidden]);
  const focusPanelId = presetDef.focus ?? null;

  const selectPanel = useCallback((id: string | null) => {
    setSelectedPanelId(id);
    if (id) setInspectorOpen(true);
  }, []);

  const value = useMemo(
    () => ({
      editMode,
      setEditMode,
      toggleEditMode: () => setEditMode((v) => !v),
      inspectorOpen,
      setInspectorOpen,
      toggleInspector: () => setInspectorOpen((v) => !v),
      helpOpen,
      setHelpOpen,
      toggleHelp: () => setHelpOpen((v) => !v),
      selectedPanelId,
      selectPanel,
      preset,
      setPreset,
      hiddenPanelIds,
      focusPanelId,
    }),
    [editMode, inspectorOpen, helpOpen, selectedPanelId, selectPanel, preset, hiddenPanelIds, focusPanelId]
  );

  return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
}

export function useTerminal(): TerminalCtx {
  const ctx = useContext(TerminalContext);
  if (!ctx) throw new Error("useTerminal must be used within TerminalProvider");
  return ctx;
}

export function useTerminalOptional(): TerminalCtx | null {
  return useContext(TerminalContext);
}
