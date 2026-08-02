import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface FinCompany {
  code: string; // sh600519 形式
  name: string;
}

interface FinCtx {
  company: FinCompany;
  recent: FinCompany[];
  select: (code: string, name: string) => void;
}

const DEFAULT_COMPANY: FinCompany = { code: "sh600519", name: "贵州茅台" };

const FinContext = createContext<FinCtx>({ company: DEFAULT_COMPANY, recent: [], select: () => {} });

const LS_KEY = "fin:recent";
const MAX_RECENT = 6;

function loadRecent(): FinCompany[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (Array.isArray(v))
      return v.filter((x) => x && typeof x.code === "string" && typeof x.name === "string").slice(0, MAX_RECENT);
  } catch { /* 忽略损坏数据 */ }
  return [];
}

/** 公司选择状态(finCompany 与 finTrend 共享): 默认贵州茅台, 最近查看存 localStorage */
export function FinProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<FinCompany>(DEFAULT_COMPANY);
  const [recent, setRecent] = useState<FinCompany[]>(loadRecent);

  const select = useCallback((code: string, name: string) => {
    setCompany({ code, name });
    setRecent((rs) => {
      const next = [{ code, name }, ...rs.filter((r) => r.code !== code)].slice(0, MAX_RECENT);
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* 隐私模式/配额满时忽略 */ }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ company, recent, select }), [company, recent, select]);
  // .ts 文件不可用 JSX, 用 createElement 挂载 Provider
  return createElement(FinContext.Provider, { value }, children);
}

export function useFin() {
  return useContext(FinContext);
}
