/**
 * 布局 / 偏好统一同步层 — 三种后端同一契约，调用方只认 get/set(key)：
 *   hosting  : HOSTING=1，Bearer token，/api/hosting/layout（mrd-pro 私有仓实现）
 *   selfhost : SELFHOST=1 + SELFHOST_SYNC_KEY，X-Sync-Key，/api/selfhost/layout（本仓）
 *   local    : 以上皆不可用 → localStorage
 *
 * 语义：服务端按顶层 key merge；每个 key 的值由调用方自定（建议带 updatedAt 做 last-write-wins）。
 * 读：先返回本机缓存(秒开)，再用服务端值覆盖；写：debounce 500ms，失败静默、本机缓存始终写。
 */
import { hostingToken, hostingLayout, hostingLayoutSave } from "./hosting";
import { loadJson, saveJson } from "./storage";

export type SyncBackend = "hosting" | "selfhost" | "local";

const SELFHOST_KEY_LS = "mrd.selfhost.syncKey";
const CACHE_PREFIX = "mrd.layout.cache:";
const SAVE_DEBOUNCE_MS = 500;

let backendPromise: Promise<SyncBackend> | null = null;
const listeners = new Set<(b: SyncBackend) => void>();
let currentBackend: SyncBackend = "local";

const timeoutSignal = (ms: number) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

/** 自部署同步密钥（用户在设置里填写一次，存本机） */
export function selfhostSyncKey(): string {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(SELFHOST_KEY_LS) || "";
}

export function setSelfhostSyncKey(key: string): void {
  if (typeof window === "undefined") return;
  if (key) window.localStorage.setItem(SELFHOST_KEY_LS, key);
  else window.localStorage.removeItem(SELFHOST_KEY_LS);
  backendPromise = null; // 重新探测
  void detectBackend();
}

async function selfhostFetch<T>(init?: RequestInit): Promise<T> {
  const r = await fetch("/api/selfhost/layout", {
    ...init,
    headers: { "Content-Type": "application/json", "X-Sync-Key": selfhostSyncKey(), ...(init?.headers || {}) },
    signal: timeoutSignal(8000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) {
    const e = new Error(j?.error || `HTTP ${r.status}`) as Error & { status?: number };
    e.status = r.status;
    throw e;
  }
  return j.data as T;
}

/** 探测可用后端（会话内只探测一次；setSelfhostSyncKey 后重探） */
export function detectBackend(): Promise<SyncBackend> {
  if (backendPromise) return backendPromise;
  backendPromise = (async (): Promise<SyncBackend> => {
    let b: SyncBackend = "local";
    if (hostingToken()) b = "hosting";
    else if (selfhostSyncKey()) {
      try {
        await selfhostFetch<{ layout: unknown }>();
        b = "selfhost";
      } catch (e) {
        // 401 = 密钥错；404 = 服务端未配置；其它 = 网络 → 均退回本机
        void e;
        b = "local";
      }
    }
    currentBackend = b;
    listeners.forEach((l) => l(b));
    return b;
  })();
  return backendPromise;
}

export function syncBackend(): SyncBackend {
  return currentBackend;
}

export function onBackendChange(l: (b: SyncBackend) => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** 读取 key：先本机缓存，再服务端（服务端可用且有值时覆盖并回写缓存） */
export function readCached<T>(key: string, fallback: T): T {
  return loadJson<T>(CACHE_PREFIX + key, fallback);
}

export async function readRemote<T>(key: string): Promise<T | undefined> {
  const b = await detectBackend();
  try {
    if (b === "hosting") {
      const obj = (await hostingLayout()) as Record<string, unknown> | null;
      const v = obj?.[key] as T | undefined;
      if (v !== undefined) saveJson(CACHE_PREFIX + key, v);
      return v;
    }
    if (b === "selfhost") {
      const d = await selfhostFetch<{ layout: Record<string, unknown> }>();
      const v = d.layout?.[key] as T | undefined;
      if (v !== undefined) saveJson(CACHE_PREFIX + key, v);
      return v;
    }
  } catch {
    // 服务端暂不可用：返回 undefined，调用方保留本机值
  }
  return undefined;
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** 写入 key：本机缓存立即写；服务端 debounce 合并写 */
export function write<T>(key: string, value: T): void {
  saveJson(CACHE_PREFIX + key, value);
  const t = pending.get(key);
  if (t) clearTimeout(t);
  pending.set(
    key,
    setTimeout(async () => {
      pending.delete(key);
      const b = await detectBackend();
      try {
        if (b === "hosting") await hostingLayoutSave({ [key]: value as unknown as string | null });
        else if (b === "selfhost") await selfhostFetch({ method: "POST", body: JSON.stringify({ layout: { [key]: value } }) });
      } catch {
        // 写失败静默，本机缓存已保存，下次写入重试
      }
    }, SAVE_DEBOUNCE_MS)
  );
}

/** 立即刷写所有挂起的写入（页面卸载前） */
export function flush(): void {
  for (const [key, t] of pending) {
    clearTimeout(t);
    pending.delete(key);
    const value = loadJson<unknown>(CACHE_PREFIX + key, undefined);
    if (value === undefined) continue;
    if (currentBackend === "hosting") void hostingLayoutSave({ [key]: value as string | null }).catch(() => {});
    else if (currentBackend === "selfhost")
      void fetch("/api/selfhost/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sync-Key": selfhostSyncKey() },
        body: JSON.stringify({ layout: { [key]: value } }),
        keepalive: true,
      }).catch(() => {});
  }
}

/** 新设备引导：任意页面带 ?syncKey=xxx 打开一次 → 写入本机并从地址栏抹掉（模块加载时执行，先于一切渲染） */
function consumeSyncKeyParam(): void {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    const k = u.searchParams.get("syncKey");
    if (!k) return;
    window.localStorage.setItem(SELFHOST_KEY_LS, k);
    u.searchParams.delete("syncKey");
    window.history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
  } catch {
    /* URL 解析失败忽略 */
  }
}

if (typeof window !== "undefined") {
  consumeSyncKeyParam();
  window.addEventListener("pagehide", flush);
}
