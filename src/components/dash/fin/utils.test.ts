import { describe, expect, it } from "vitest";
import { resolveFinCompanyQuery } from "./utils";

describe("resolveFinCompanyQuery", () => {
  it("parses bare 6-digit A-share code", () => {
    expect(resolveFinCompanyQuery("600519")).toEqual({ code: "sh600519", name: "" });
    expect(resolveFinCompanyQuery("000001")).toEqual({ code: "sz000001", name: "" });
  });

  it("parses prefixed code", () => {
    expect(resolveFinCompanyQuery("sh600519")).toEqual({ code: "sh600519", name: "" });
  });

  it("rejects non-A-share input", () => {
    expect(resolveFinCompanyQuery("hk00700")).toBeNull();
    expect(resolveFinCompanyQuery("茅台")).toBeNull();
    expect(resolveFinCompanyQuery("")).toBeNull();
  });
});
