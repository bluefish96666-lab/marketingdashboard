import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { HeatGroup, HeatStock, MoversFilter, AreaMode } from "@/lib/heatmap-data";
import { MOCK_HEAT_GROUPS } from "@/lib/heatmap-data";
import type { NewsItem } from "@/lib/api";
import { loadJson, saveJson } from "@/lib/storage";

export type GmtPreset = "GLOBAL" | "EQUITIES" | "MACRO" | "FLOW";

export interface WidgetLayoutItem {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

export type WidgetId =
  | "heatmap"
  | "breadth"
  | "news"
  | "chart"
  | "sector"
  | "indices"
  | "flow"
  | "macro"
  | "status";

export const WIDGET_IDS: WidgetId[] = ["heatmap", "breadth", "news", "chart", "sector", "indices", "flow", "macro", "status"];

export const GMT_COLS = 12;

export interface GmtInspectTarget {
  type: "stock" | "news" | "index";
  stock?: HeatStock;
  news?: NewsItem;
  indexLabel?: string;
  indexPrice?: number;
  indexPct?: number;
}

/** 09 数据状态：各组件上报的数据源心跳 */
export interface SourceStat {
  label: string;
  ok: boolean;
  n: number;
  at: number;
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
  updateWidget: (id: WidgetId, patch: Partial<WidgetLayoutItem>) => void;
  removeWidget: (id: WidgetId) => void;
  addWidget: (id: WidgetId) => void;
  resetLayout: () => void;
  zoomed: WidgetId | null;
  setZoomed: (id: WidgetId | null) => void;
  tapePaused: boolean;
  setTapePaused: Dispatch<SetStateAction<boolean>>;
  sources: Record<string, SourceStat>;
  reportSource: (key: string, label: string, ok: boolean, n: number) => void;
}

const GmtContext = createContext<GmtCtx | null>(null);

const LAYOUT_KEY = "gmt.layout.v2";
const PRESET_KEY = "gmt.preset.v2";

export const DEFAULT_GMT_LAYOUT: Record<WidgetId, WidgetLayoutItem> = {
  heatmap: { x: 0, y: 0, w: 8, h: 6, visible: true },
  breadth: { x: 8, y: 0, w: 4, h: 2, visible: true },
  news: { x: 8, y: 2, w: 4, h: 4, visible: true },
  chart: { x: 0, y: 6, w: 7, h: 4, visible: true },
  sector: { x: 7, y: 6, w: 5, h: 4, visible: true },
  indices: { x: 0, y: 10, w: 4, h: 4, visible: true },
  flow: { x: 4, y: 10, w: 4, h: 4, visible: true },
  macro: { x: 8, y: 10, w: 4, h: 3, visible: true },
  status: { x: 8, y: 13, w: 4, h: 1, visible: true },
};

const HIDDEN: WidgetLayoutItem = { x: 0, y: 0, w: 4, h: 3, visible: false };

const PRESETS: Record<GmtPreset, Record<WidgetId, WidgetLayoutItem>> = {
  GLOBAL: DEFAULT_GMT_LAYOUT,
  EQUITIES: {
    heatmap: { x: 0, y: 0, w: 8, h: 7, visible: true },
    breadth: { x: 8, y: 0, w: 4, h: 2, visible: true },
    sector: { x: 8, y: 2, w: 4, h: 5, visible: true },
    chart: { x: 0, y: 7, w: 6, h: 4, visible: true },
    flow: { x: 6, y: 7, w: 6, h: 4, visible: true },
    news: HIDDEN,
    indices: HIDDEN,
    macro: HIDDEN,
    status: { x: 0, y: 11, w: 12, h: 1, visible: true },
  },
  MACRO: {
    news: { x: 0, y: 0, w: 7, h: 7, visible: true },
    indices: { x: 7, y: 0, w: 5, h: 4, visible: true },
    macro: { x: 7, y: 4, w: 5, h: 3, visible: true },
    breadth: { x: 0, y: 7, w: 5, h: 2, visible: true },
    heatmap: { x: 5, y: 7, w: 7, h: 4, visible: true },
    chart: HIDDEN,
    sector: HIDDEN,
    flow: HIDDEN,
    status: { x: 0, y: 9, w: 5, h: 1, visible: true },
  },
  FLOW: {
    flow: { x: 0, y: 0, w: 5, h: 7, visible: true },
    sector: { x: 5, y: 0, w: 4, h: 7, visible: true },
    breadth: { x: 9, y: 0, w: 3, h: 3, visible: true },
    heatmap: { x: 9, y: 3, w: 3, h: 4, visible: true },
    chart: { x: 0, y: 7, w: 6, h: 4, visible: true },
    news: { x: 6, y: 7, w: 6, h: 4, visible: true },
    indices: HIDDEN,
    macro: HIDDEN,
    status: HIDDEN,
  },
};

function clampItem(it: WidgetLayoutItem): WidgetLayoutItem {
  const w = Math.min(GMT_COLS, Math.max(2, Math.round(it.w)));
  const h = Math.max(1, Math.round(it.h));
  const x = Math.min(GMT_COLS - w, Math.max(0, Math.round(it.x)));
  const y = Math.max(0, Math.round(it.y));
  return { ...it, x, y, w, h };
}

function loadLayout(): Record<WidgetId, WidgetLayoutItem> {
  const saved = loadJson<Partial<Record<WidgetId, WidgetLayoutItem>> | null>(LAYOUT_KEY, null);
  if (!saved) return DEFAULT_GMT_LAYOUT;
  const out = { ...DEFAULT_GMT_LAYOUT };
  for (const id of WIDGET_IDS) if (saved[id]) out[id] = clampItem({ ...out[id], ...saved[id]! });
  return out;
}

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
  const [preset, setPreset] = useState<GmtPreset>(() => loadJson<GmtPreset>(PRESET_KEY, "GLOBAL"));
  const [layout, setLayout] = useState(loadLayout);
  const [zoomed, setZoomed] = useState<WidgetId | null>(null);
  const [tapePaused, setTapePaused] = useState(false);
  const [sources, setSources] = useState<Record<string, SourceStat>>({});

  useEffect(() => saveJson(LAYOUT_KEY, layout), [layout]);
  useEffect(() => saveJson(PRESET_KEY, preset), [preset]);

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
    setLayout({ ...PRESETS[p] });
  }, []);

  const resetLayout = useCallback(() => {
    setPreset("GLOBAL");
    setLayout({ ...DEFAULT_GMT_LAYOUT });
  }, []);

  const updateWidget = useCallback((id: WidgetId, patch: Partial<WidgetLayoutItem>) => {
    setLayout((prev) => {
      const next = clampItem({ ...prev[id], ...patch });
      const cur = prev[id];
      if (next.x === cur.x && next.y === cur.y && next.w === cur.w && next.h === cur.h && next.visible === cur.visible) return prev;
      return { ...prev, [id]: next };
    });
  }, []);

  const removeWidget = useCallback((id: WidgetId) => {
    setLayout((prev) => ({ ...prev, [id]: { ...prev[id], visible: false } }));
    setZoomed((z) => (z === id ? null : z));
  }, []);

  const addWidget = useCallback((id: WidgetId) => {
    setLayout((prev) => {
      let bottom = 0;
      for (const k of WIDGET_IDS) {
        const it = prev[k];
        if (it.visible) bottom = Math.max(bottom, it.y + it.h);
      }
      const base = DEFAULT_GMT_LAYOUT[id];
      return { ...prev, [id]: clampItem({ x: 0, y: bottom, w: base.w, h: base.h, visible: true }) };
    });
  }, []);

  const reportSource = useCallback((key: string, label: string, ok: boolean, n: number) => {
    setSources((prev) => ({ ...prev, [key]: { label, ok, n, at: Date.now() } }));
  }, []);

  const value = useMemo<GmtCtx>(
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
      updateWidget,
      removeWidget,
      addWidget,
      resetLayout,
      zoomed,
      setZoomed,
      tapePaused,
      setTapePaused,
      sources,
      reportSource,
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
      updateWidget,
      removeWidget,
      addWidget,
      resetLayout,
      zoomed,
      tapePaused,
      sources,
      reportSource,
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
  indices: { num: "06", title: "全球指数" },
  flow: { num: "07", title: "主力净流入" },
  macro: { num: "08", title: "商品 · 美债" },
  status: { num: "09", title: "数据状态" },
};
