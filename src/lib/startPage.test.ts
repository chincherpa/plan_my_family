import { describe, expect, it } from "vitest";
import { shouldOpenDashboard } from "./startPage";

describe("shouldOpenDashboard", () => {
  it("opens the dashboard when the app is opened on another page", () => {
    expect(shouldOpenDashboard("navigate", "/calendar")).toBe(true);
    expect(shouldOpenDashboard("back_forward", "/meals")).toBe(true);
    expect(shouldOpenDashboard(undefined, "/calendar")).toBe(true);
  });

  it("stays on the page after a reload", () => {
    expect(shouldOpenDashboard("reload", "/calendar")).toBe(false);
  });

  it("does nothing on the dashboard itself", () => {
    expect(shouldOpenDashboard("navigate", "/")).toBe(false);
  });
});
