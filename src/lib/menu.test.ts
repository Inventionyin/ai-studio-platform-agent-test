import { describe, expect, it } from "vitest";
import { resolveNav } from "@/config/menu";

describe("resolveNav", () => {
  it("resolves a global page", () => {
    const nav = resolveNav("/dashboard");
    expect(nav.layer).toBe("global");
    expect(nav.menu?.key).toBe("dashboard");
    expect(nav.tab?.label).toBe("概览");
  });

  it("resolves a project detail page", () => {
    const nav = resolveNav("/project/payment/requirements/REQ-001");
    expect(nav.layer).toBe("project");
    expect(nav.pid).toBe("payment");
    expect(nav.menu?.key).toBe("requirements");
    expect(nav.tab?.label).toBe("需求详情");
  });

  it("resolves an admin page", () => {
    const nav = resolveNav("/admin/audit/logs");
    expect(nav.layer).toBe("admin");
    expect(nav.menu?.key).toBe("audit");
    expect(nav.tab?.label).toBe("审计日志");
  });
});
