import { BRAND } from "@/config/branding";

/** 同步 document 级品牌元数据(与 index.html / manifest 保持一致) */
export function initBranding(): void {
  document.title = BRAND.title;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute("content", BRAND.description);
  const apple = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (apple) apple.setAttribute("content", BRAND.shortName);
}
