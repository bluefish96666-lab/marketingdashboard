import type { ReactNode } from "react";

export interface TabDef<T extends string | number = string> {
  key: T;
  label: string;
}

/**
 * 统一标签栏/分段控件 — 替代各面板重复的 tab 切换按钮。
 * `accent` 控制高亮色: cyan / amber / violet / emerald / rose。
 */
export function TabBar<T extends string | number>({
  tabs,
  active,
  onChange,
  accent = "cyan",
  size = "sm",
  variant = "pill",
}: {
  tabs: (TabDef<T> | { key: T; label: string })[];
  active: T;
  onChange: (key: T) => void;
  accent?: "cyan" | "amber" | "violet" | "emerald" | "rose";
  size?: "xs" | "sm";
  variant?: "pill" | "underline";
}) {
  const ACCENT: Record<string, string> = {
    cyan: "bg-cyan-500/20 text-cyan-300",
    amber: "bg-amber-500/20 text-amber-300",
    violet: "bg-violet-500/20 text-violet-300",
    emerald: "bg-emerald-500/20 text-emerald-300",
    rose: "bg-rose-500/20 text-rose-300",
  };
  const ACTIVE_CLS = variant === "underline"
    ? {
        cyan: "border-cyan-400 text-cyan-300",
        amber: "border-amber-400 text-amber-300",
        violet: "border-violet-400 text-violet-300",
        emerald: "border-emerald-400 text-emerald-300",
        rose: "border-rose-400 text-rose-300",
      }[accent]
    : ACCENT[accent];

  const baseCls = size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5";

  return (
    <div className="flex items-center gap-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`rounded ${baseCls} transition-colors ${
            active === t.key
              ? variant === "underline"
                ? `border-b-2 ${ACTIVE_CLS} border-b-current`
                : ACTIVE_CLS
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** 异步内容四态包装: loading(skeleton) → error(retry) → empty(message) → content */
export function AsyncContent({
  loading,
  error,
  empty,
  emptyMessage,
  onRetry,
  skeletonRows = 6,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyMessage?: string;
  onRetry: () => void;
  skeletonRows?: number;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex h-full flex-col gap-[6px] p-2">
        {Array.from({ length: skeletonRows }, (_, i) => (
          <div key={i} className="h-3 shrink-0 rounded bg-slate-800/40" style={{ width: `${88 - (i % 3) * 12}%` }} />
        ))}
        <div className="mt-auto pt-1 text-center text-[11px] text-slate-600">数据加载中…</div>
      </div>
    );
  }

  if (error && !loading) {
    return (
      <div className="flex h-full items-center justify-center text-[11px]">
        <button className="h-full w-full text-slate-500" onClick={onRetry}>
          数据获取失败，点击重试{error ? `(${error})` : ""}
        </button>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-slate-600">
        {emptyMessage || "暂无数据"}
      </div>
    );
  }

  return <>{children}</>;
}
