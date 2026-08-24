// 自部署模式 UTM 初始化: 仅在非自部署实例上报 knock 渠道统计
import { selfhostEnabled } from "./selfhost";
import { initUtmTracking } from "./utm";

export async function initUtmIfPublic(): Promise<void> {
  try {
    if (await selfhostEnabled()) return;
    initUtmTracking();
  } catch {
    initUtmTracking();
  }
}
