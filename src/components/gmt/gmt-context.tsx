import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { HeatGroup, HeatStock, MoversFilter, AreaMode } from "@/lib/heatmap-data";
import { MOCK_HEAT_GROUPS } from "@/lib/heatmap-data";
import type { NewsItem } from "@/lib/api";
import { readCached, readRemote, write } from "@/lib/layout-sync";

export type GmtPreset = "GLOBAL" | "EQUITIES" | "METALS" | "NEWS";
export const GMT_PRESETS: { id: GmtPreset; label: string }[] = [
  { id: "GLOBAL", label: "全球" },
  { id: "EQUITIES", label: "股票" },
  { id: "METALS", label: "贵金属" },
  { id: "NEWS", label: "新闻" },
];

export interface WidgetLayoutItem {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
  locked?: boolean;
  min?: boolean;
}

/** 编号对齐 Kimi K3：01–09 同名同位；10 主力净流入为 A 股特色补充 */
export type WidgetId = "heatmap" | "breadth" | "news" | "chart" | "sector" | "metals" | "pulse" | "indices" | "status" | "flow";

export const WIDGET_IDS: WidgetId[] = ["heatmap", "breadth", "news", "chart", "sector", "metals", "pulse", "indices", "status", "flow"];

export const GMT_COLS = 12;

export interface GmtInspectTarget {
  type: "stock" | "news" | "index" | "metal" | "market";
  stock?: HeatStock;
  news?: NewsItem;
  label?: string;
  price?: number;
  pct?: number;
  rows?: [string, string][];
}

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
  openInspect: (t: GmtInspectTarget) => void;
  inspectorOpen: boolean;
  setInspectorOpen: Dispatch<SetStateAction<boolean>>;
  helpOpen: boolean;
  setHelpOpen: Dispatch<SetStateAction<boolean>>;
  dataOpen: boolean;
  setDataOpen: Dispatch<SetStateAction<boolean>>;
  editMode: boolean;
  setEditMode: Dispatch<SetStateAction<boolean>>;
  preset: GmtPreset;
  applyPreset: (p: GmtPreset) => void;
  layout: Record<WidgetId, WidgetLayoutItem>;
  updateWidget: (id: WidgetId, patch: Partial<WidgetLayoutItem>) => void;
  removeWidget: (id: WidgetId) => void;
  addWidget: (id: WidgetId) => void;
  toggleWidget: (id: WidgetId) => void;
  nudgeWidget: (id: WidgetId, dir: -1 | 1) => void;
  resetLayout: () => void;
  focused: WidgetId | null;
  setFocused: (id: WidgetId | null) => void;
  zoomed: WidgetId | null;
  setZoomed: (id: WidgetId | null) => void;
  tapePaused: boolean;
  setTapePaused: Dispatch<SetStateAction<boolean>>;
  sources: Record<string, SourceStat>;
  reportSource: (key: string, label: string, ok: boolean, n: number) => void;
}

const GmtContext = createContext<GmtCtx | null>(null);

/** 同步层 key：整份 GMT 偏好一个 key，服务端按 key merge，last-write-wins 看 updatedAt */
const SYNC_KEY = "gmt.v1";

interface GmtPersist {
  preset: GmtPreset;
  layout: Partial<Record<WidgetId, WidgetLayoutItem>>;
  updatedAt: number;
}

export const DEFAULT_GMT_LAYOUT: Record<WidgetId, WidgetLayoutItem> = {
  heatmap: { x: 0, y: 0, w: 8, h: 6, visible: true },
  breadth: { x: 8, y: 0, w: 4, h: 2, visible: true },
  news: { x: 8, y: 2, w: 4, h: 4, visible: true },
  chart: { x: 0, y: 6, w: 7, h: 5, visible: true },
  sector: { x: 7, y: 6, w: 5, h: 5, visible: true },
  metals: { x: 0, y: 11, w: 7, h: 6, visible: true },
  pulse: { x: 7, y: 11, w: 5, h: 5, visible: true },
  indices: { x: 7, y: 16, w: 5, h: 6, visible: true },
  status: { x: 0, y: 17, w: 7, h: 2, visible: true },
  flow: { x: 0, y: 19, w: 7, h: 3, visible: true },
};

const HIDDEN: WidgetLayoutItem = { x: 0, y: 0, w: 4, h: 3, visible: false };

const PRESETS: Record<GmtPreset, Record<WidgetId, WidgetLayoutItem>> = {
  GLOBAL: DEFAULT_GMT_LAYOUT,
  EQUITIES: {
    heatmap: { x: 0, y: 0, w: 8, h: 7, visible: true },
    breadth: { x: 8, y: 0, w: 4, h: 2, visible: true },
    sector: { x: 8, y: 2, w: 4, h: 5, visible: true },
    chart: { x: 0, y: 7, w: 7, h: 5, visible: true },
    flow: { x: 7, y: 7, w: 5, h: 5, visible: true },
    indices: { x: 0, y: 12, w: 7, h: 5, visible: true },
    status: { x: 7, y: 12, w: 5, h: 2, visible: true },
    news: HIDDEN,
    metals: HIDDEN,
    pulse: HIDDEN,
  },
  METALS: {
    metals: { x: 0, y: 0, w: 8, h: 7, visible: true },
    pulse: { x: 8, y: 0, w: 4, h: 4, visible: true },
    news: { x: 8, y: 4, w: 4, h: 5, visible: true },
    indices: { x: 0, y: 7, w: 5, h: 6, visible: true },
    heatmap: { x: 5, y: 9, w: 7, h: 4, visible: true },
    status: { x: 0, y: 13, w: 12, h: 2, visible: true },
    breadth: HIDDEN,
    chart: HIDDEN,
    sector: HIDDEN,
    flow: HIDDEN,
  },
  NEWS: {
    news: { x: 0, y: 0, w: 7, h: 8, visible: true },
    pulse: { x: 7, y: 0, w: 5, h: 4, visible: true },
    indices: { x: 7, y: 4, w: 5, h: 6, visible: true },
    breadth: { x: 0, y: 8, w: 7, h: 2, visible: true },
    heatmap: { x: 0, y: 10, w: 7, h: 4, visible: true },
    status: { x: 7, y: 10, w: 5, h: 2, visible: true },
    chart: HIDDEN,
    sector: HIDDEN,
    metals: HIDDEN,
    flow: HIDDEN,
  },
};

function clampItem(it: WidgetLayoutItem): WidgetLayoutItem {
  const w = Math.min(GMT_COLS, Math.max(2, Math.round(it.w)));
  const h = Math.max(1, Math.round(it.h));
  const x = Math.min(GMT_COLS - w, Math.max(0, Math.round(it.x)));
  const y = Math.max(0, Math.round(it.y));
  return { ...it, x, y, w, h };
}

function overlaps(a: WidgetLayoutItem, b: WidgetLayoutItem): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 碰撞推挤：以 movedId 为锚，其它与之重叠的组件依次向下推，直到无重叠 */
function resolveCollisions(layout: Record<WidgetId, WidgetLayoutItem>, movedId: WidgetId): Record<WidgetId, WidgetLayoutItem> {
  const next = { ...layout };
  const order = WIDGET_IDS.filter((id) => next[id].visible && id !== movedId).sort((a, b) => next[a].y - next[b].y || next[a].x - next[b].x);
  // 按 y 顺序逐个定位：与任一已定位组件重叠就贴到它下方，已定位的不再移动 → 结果必然无重叠
  const placed: WidgetId[] = [movedId];
  for (const id of order) {
    let it = next[id];
    for (let guard = 0; guard < 100; guard++) {
      const hit = placed.find((p) => overlaps(it, next[p]));
      if (!hit) break;
      it = { ...it, y: next[hit].y + next[hit].h };
    }
    next[id] = it;
    placed.push(id);
  }
  return next;
}

function mergeLayout(saved: Partial<Record<WidgetId, WidgetLayoutItem>> | null | undefined): Record<WidgetId, WidgetLayoutItem> {
  if (!saved) return DEFAULT_GMT_LAYOUT;
  const out = { ...DEFAULT_GMT_LAYOUT };
  for (const id of WIDGET_IDS) if (saved[id]) out[id] = clampItem({ ...out[id], ...saved[id]! });
  return out;
}

function loadPersist(): GmtPersist | null {
  const p = readCached<GmtPersist | null>(SYNC_KEY, null);
  return p && typeof p === "object" ? p : null;
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
  const [dataOpen, setDataOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [preset, setPreset] = useState<GmtPreset>(() => loadPersist()?.preset ?? "GLOBAL");
  const [layout, setLayout] = useState(() => mergeLayout(loadPersist()?.layout));
  const [focused, setFocused] = useState<WidgetId | null>(null);
  const [zoomed, setZoomed] = useState<WidgetId | null>(null);
  const [tapePaused, setTapePaused] = useState(false);
  const [sources, setSources] = useState<Record<string, SourceStat>>({});

  // 持久化：本机秒开 → 服务端更新的值覆盖 → 用户改动 debounce 写回（首个渲染与远端回填不写）
  const skipWriteRef = useRef(true);
  const updatedAtRef = useRef<number>(loadPersist()?.updatedAt ?? 0);
  useEffect(() => {
    let alive = true;
    readRemote<GmtPersist>(SYNC_KEY).then((remote) => {
      if (!alive || !remote?.layout) return;
      if ((remote.updatedAt ?? 0) <= updatedAtRef.current) return;
      skipWriteRef.current = true;
      updatedAtRef.current = remote.updatedAt ?? 0;
      setPreset(remote.preset ?? "GLOBAL");
      setLayout(mergeLayout(remote.layout));
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (skipWriteRef.current) {
      skipWriteRef.current = false;
      return;
    }
    const now = Date.now();
    updatedAtRef.current = now;
    write<GmtPersist>(SYNC_KEY, { preset, layout, updatedAt: now });
  }, [layout, preset]);

  const flatStocks = useMemo(() => groups.flatMap((g) => g.stocks), [groups]);

  const openInspect = useCallback((t: GmtInspectTarget) => {
    setInspect(t);
    setInspectorOpen(true);
  }, []);

  const selectStock = useCallback(
    (s: HeatStock | null) => {
      setSelected(s);
      if (s) openInspect({ type: "stock", stock: s });
    },
    [openInspect]
  );

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
      const geomChanged = next.x !== cur.x || next.y !== cur.y || next.w !== cur.w || next.h !== cur.h;
      if (!geomChanged && next.visible === cur.visible && next.locked === cur.locked && next.min === cur.min) return prev;
      const merged = { ...prev, [id]: next };
      return geomChanged ? resolveCollisions(merged, id) : merged;
    });
  }, []);

  const removeWidget = useCallback((id: WidgetId) => {
    setLayout((prev) => ({ ...prev, [id]: { ...prev[id], visible: false } }));
    setZoomed((z) => (z === id ? null : z));
    setFocused((f) => (f === id ? null : f));
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

  const toggleWidget = useCallback(
    (id: WidgetId) => {
      if (layout[id].visible) removeWidget(id);
      else addWidget(id);
    },
    [layout, removeWidget, addWidget]
  );

  const nudgeWidget = useCallback(
    (id: WidgetId, dir: -1 | 1) => updateWidget(id, { y: layout[id].y + dir }),
    [layout, updateWidget]
  );

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
      openInspect,
      inspectorOpen,
      setInspectorOpen,
      helpOpen,
      setHelpOpen,
      dataOpen,
      setDataOpen,
      editMode,
      setEditMode,
      preset,
      applyPreset,
      layout,
      updateWidget,
      removeWidget,
      addWidget,
      toggleWidget,
      nudgeWidget,
      resetLayout,
      focused,
      setFocused,
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
      openInspect,
      inspectorOpen,
      helpOpen,
      dataOpen,
      editMode,
      preset,
      applyPreset,
      layout,
      updateWidget,
      removeWidget,
      addWidget,
      toggleWidget,
      nudgeWidget,
      resetLayout,
      focused,
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

export const GMT_WIDGET_META: Record<WidgetId, { num: string; title: string; note: string }> = {
  heatmap: { num: "01", title: "个股追踪 · 热力矩阵", note: "腾讯行情 · 产业链分组" },
  breadth: { num: "02", title: "市场宽度", note: "样本内实时计算" },
  news: { num: "03", title: "新闻快讯", note: "自动 20s · 华尔街见闻" },
  chart: { num: "04", title: "选中标的 · 分时", note: "腾讯分时 · 15s" },
  sector: { num: "05", title: "板块日内走势", note: "产业链等权 · 15s" },
  metals: { num: "06", title: "贵金属 · GC XAU AU SI", note: "新浪期货 · 5s" },
  pulse: { num: "07", title: "市场脉搏 · 全球时钟", note: "实时时钟 · IANA 时区 · 节假日未核实" },
  indices: { num: "08", title: "全球指数一览", note: "状态实时计算 · 5s 刷新" },
  status: { num: "09", title: "数据状态 · 数据源", note: "实时刷新" },
  flow: { num: "10", title: "主力净流入", note: "东财口径 · 20s" },
};
