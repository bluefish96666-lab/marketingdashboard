import { createContext, useCallback, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { HeatGroup, HeatStock, MoversFilter, AreaMode } from "@/lib/heatmap-data";
import { MOCK_HEAT_GROUPS } from "@/lib/heatmap-data";
import type { NewsItem } from "@/lib/api";

export type GmtPreset = "GLOBAL" | "EQUITIES" | "MACRO" | "FLOW";

export interface WidgetLayoutItem {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

export type WidgetId = "heatmap" | "breadth" | "news" | "chart" | "sector";

export interface GmtInspectTarget {
  type: "stock" | "news" | "index";
  stock?: HeatStock;
  news?: NewsItem;
  indexLabel?: string;
  indexPrice?: number;
  indexPct?: number;
}

interface GmtCtx {
  groups: HeatGroup[];
  setGroups: (g: HeatGroup[]) => void;
  sector: string;
  setSector: (s: string) => void;
  movers: MoversFilter;
  setMovers: Dispatch<SetStateAction<MoversFilter>>;
  area: AreaMode;
  setArea: Dispatch<SetStateAction<AreaMode>>;
  search: string;
  setSearch: (s: string) => void;
  flatStocks: HeatStock[];
  selected: HeatStock | null;
  selectStock: (s: HeatStock | null) => void;
  inspect: GmtInspectTarget | null;
  setInspect: (t: GmtInspectTarget | null) => void;
  inspectorOpen: boolean;
  setInspectorOpen: Dispatch<SetStateAction<boolean>>;
  helpOpen: boolean;
  setHelpOpen: Dispatch<SetStateAction<boolean>>;
  editMode: boolean;
  setEditMode: Dispatch<SetStateAction<boolean>>;
  preset: GmtPreset;
  applyPreset: (p: GmtPreset) => void;
  layout: Record<WidgetId, WidgetLayoutItem>;
  resetLayout: () => void;
  tapePaused: boolean;
  setTapePaused: Dispatch<SetStateAction<boolean>>;
}

const GmtContext = createContext<GmtCtx | null>(null);

export const DEFAULT_GMT_LAYOUT: Record<WidgetId, WidgetLayoutItem> = {
  heatmap: { x: 0, y: 0, w: 8, h: 6, visible: true },
  breadth: { x: 8, y: 0, w: 4, h: 2, visible: true },
  news: { x: 8, y: 2, w: 4, h: 4, visible: true },
  chart: { x: 0, y: 6, w: 7, h: 5, visible: true },
  sector: { x: 7, y: 6, w: 5, h: 5, visible: true },
};

const PRESETS: Record<GmtPreset, Partial<Record<WidgetId, Partial<WidgetLayoutItem>>>> = {
  GLOBAL: {},
  EQUITIES: {
    heatmap: { x: 0, y: 0, w: 8, h: 7, visible: true },
    breadth: { x: 8, y: 0, w: 4, h: 2, visible: true },
    news: { x: 8, y: 2, w: 4, h: 5, visible: true },
    chart: { x: 0, y: 7, w: 7, h: 5, visible: true },
    sector: { x: 7, y: 7, w: 5, h: 5, visible: true },
  },
  MACRO: {
    news: { x: 0, y: 0, w: 7, h: 8, visible: true },
    breadth: { x: 7, y: 0, w: 5, h: 3, visible: true },
    heatmap: { x: 7, y: 3, w: 5, h: 5, visible: true },
    chart: { visible: false },
    sector: { visible: false },
  },
  FLOW: {
    sector: { x: 0, y: 0, w: 8, h: 7, visible: true },
    breadth: { x: 8, y: 0, w: 4, h: 3, visible: true },
    heatmap: { x: 8, y: 3, w: 4, h: 4, visible: true },
    news: { x: 0, y: 7, w: 6, h: 4, visible: true },
    chart: { visible: false },
  },
};

export function GmtDemoProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<HeatGroup[]>(MOCK_HEAT_GROUPS);
  const [sector, setSector] = useState("ALL");
  const [movers, setMovers] = useState<MoversFilter>("ALL");
  const [area, setArea] = useState<AreaMode>("mcap");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<HeatStock | null>(null);
  const [inspect, setInspect] = useState<GmtInspectTarget | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [preset, setPreset] = useState<GmtPreset>("GLOBAL");
  const [layout, setLayout] = useState(DEFAULT_GMT_LAYOUT);
  const [tapePaused, setTapePaused] = useState(false);

  const flatStocks = useMemo(() => groups.flatMap((g) => g.stocks), [groups]);

  const selectStock = useCallback((s: HeatStock | null) => {
    setSelected(s);
    if (s) {
      setInspect({ type: "stock", stock: s });
      setInspectorOpen(true);
    }
  }, []);

  const applyPreset = useCallback((p: GmtPreset) => {
    setPreset(p);
    if (p === "GLOBAL") {
      setLayout({ ...DEFAULT_GMT_LAYOUT });
      return;
    }
    const patch = PRESETS[p];
    const next = { ...DEFAULT_GMT_LAYOUT };
    for (const id of Object.keys(next) as WidgetId[]) {
      if (patch[id]) next[id] = { ...next[id], ...patch[id]! };
      else next[id] = { ...next[id], visible: false };
    }
    for (const id of Object.keys(patch) as WidgetId[]) {
      if (patch[id]?.visible !== false) next[id] = { ...next[id], ...patch[id]! };
    }
    setLayout(next);
  }, []);

  const resetLayout = useCallback(() => {
    setPreset("GLOBAL");
    setLayout({ ...DEFAULT_GMT_LAYOUT });
  }, []);

  const value = useMemo(
    () => ({
      groups,
      setGroups,
      sector,
      setSector,
      movers,
      setMovers,
      area,
      setArea,
      search,
      setSearch,
      flatStocks,
      selected,
      selectStock,
      inspect,
      setInspect,
      inspectorOpen,
      setInspectorOpen,
      helpOpen,
      setHelpOpen,
      editMode,
      setEditMode,
      preset,
      applyPreset,
      layout,
      resetLayout,
      tapePaused,
      setTapePaused,
    }),
    [
      groups,
      sector,
      movers,
      area,
      search,
      flatStocks,
      selected,
      selectStock,
      inspect,
      inspectorOpen,
      helpOpen,
      editMode,
      preset,
      applyPreset,
      layout,
      resetLayout,
      tapePaused,
    ]
  );

  return <GmtContext.Provider value={value}>{children}</GmtContext.Provider>;
}

export function useGmtDemo(): GmtCtx {
  const ctx = useContext(GmtContext);
  if (!ctx) throw new Error("useGmtDemo must be used within GmtDemoProvider");
  return ctx;
}

export const GMT_WIDGET_META: Record<WidgetId, { num: string; title: string }> = {
  heatmap: { num: "01", title: "个股追踪 · 热力矩阵" },
  breadth: { num: "02", title: "市场宽度" },
  news: { num: "03", title: "新闻快讯" },
  chart: { num: "04", title: "选中标的 · 分时" },
  sector: { num: "05", title: "板块日内走势" },
};
