import { describe, expect, it } from "vitest";
import { APP_NAV, pageLinks } from "./lib/nav";

describe("/watch 独立自选页", () => {
  it("顶栏导航包含自选股, 且各页互相可见", () => {
    expect(APP_NAV.some((l) => l.to === "/watch" && l.label === "自选股")).toBe(true);
    expect(pageLinks("/").some((l) => l.to === "/watch")).toBe(true);
    expect(pageLinks("/watch").some((l) => l.to === "/")).toBe(true);
    expect(pageLinks("/watch").some((l) => l.to === "/watch")).toBe(false);
    expect(APP_NAV.some((l) => l.to === "/pro")).toBe(false);
    expect(pageLinks("/").some((l) => l.to === "/pro")).toBe(false);
  });
});
