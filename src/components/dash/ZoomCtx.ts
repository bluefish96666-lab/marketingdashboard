import { createContext, useContext } from "react";

/** TV 放大 zoom 值上下文: 所有 Spark 从同一 context 读同一值, React 统一批量更新,
 *  杜绝逐个读 CSS 变量/ResizeObserver 的异步时序导致的线宽不一致。 */
export const ZoomCtx = createContext(1);
export const useZoom = () => useContext(ZoomCtx);
