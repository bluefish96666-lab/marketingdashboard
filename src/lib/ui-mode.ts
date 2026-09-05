/**
 * 首页形态偏好：classic（经典看板）| gmt（GMT 终端）
 * 优先级：?mode= → 服务端同步值 → 本机缓存 → 默认 classic（P3 翻转默认时只改 DEFAULT_MODE）
 */
import { useCallback, useEffect, useState } from "react";
import { readCached, readRemote, write } from "./layout-sync";

export type UiMode = "classic" | "gmt";
export const DEFAULT_MODE: UiMode = "classic";
const KEY = "ui.mode";

interface Pref {
  mode: UiMode;
  updatedAt: number;
}

function fromUrl(): UiMode | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const m = p.get("mode");
  if (m === "gmt" || m === "classic") return m;
  if (p.get("demo") === "gmt-full") return "gmt"; // 旧 demo 地址别名
  return null;
}

export function initialMode(): UiMode {
  return fromUrl() ?? readCached<Pref | null>(KEY, null)?.mode ?? DEFAULT_MODE;
}

export function useUiMode(): [UiMode, (m: UiMode) => void] {
  const [mode, setModeState] = useState<UiMode>(initialMode);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (fromUrl()) return; // URL 显式指定：本次会话不被服务端值覆盖
    let alive = true;
    readRemote<Pref>(KEY).then((v) => {
      if (alive && v?.mode && !touched) setModeState(v.mode);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMode = useCallback((m: UiMode) => {
    setTouched(true);
    setModeState(m);
    write<Pref>(KEY, { mode: m, updatedAt: Date.now() });
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      if (u.searchParams.has("mode") || u.searchParams.has("demo")) {
        u.searchParams.delete("mode");
        u.searchParams.delete("demo");
        window.history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
      }
    }
  }, []);

  return [mode, setMode];
}
