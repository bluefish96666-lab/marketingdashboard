// 自部署模式: 运行时探测 /api/selfhost (SELFHOST=1 时 enabled=true)
// 用于 VPS 私有实例 — 去掉 GitHub/官网/Pro 预注册/UTM 等产品外链, 行情本体不变。
const timeoutSignal = (ms: number) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

/** 探测自部署模式: /api/selfhost 返回 enabled=true 即为自部署实例 */
export async function selfhostEnabled(): Promise<boolean> {
  try {
    const r = await fetch("/api/selfhost", { signal: timeoutSignal(5000) });
    if (!r.ok) return false;
    const j = await r.json().catch(() => null);
    return j?.data?.enabled === true;
  } catch {
    return false;
  }
}
