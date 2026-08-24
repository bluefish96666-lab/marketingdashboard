import { describe, expect, it } from "vitest";
import { APP_NAV, pageLinks } from "./lib/nav";

const INSTANCE_ROUTES = ["/", "/watch", "/goods", "/gold", "/ai", "/fin"];

describe("self-hosted instance UI", () => {
  it("顶栏导航只含本实例相对路由, 不含 /pro", () => {
    expect(APP_NAV.map((l) => l.to)).toEqual(INSTANCE_ROUTES);
    expect(pageLinks("/").some((l) => l.to === "/pro" || l.label === "Pro")).toBe(false);
    expect(APP_NAV.every((l) => l.to.startsWith("/") && !l.to.startsWith("//"))).toBe(true);
  });
});
