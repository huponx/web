import { describe, expect, it } from "vitest";
import {
  CATEGORY_COUNT_CAP,
  exportProgress,
  formatCount,
  REVIEW_COUNT_CAP,
} from "../api";
import type { ExportJob } from "../api";

describe("formatCount", () => {
  it("says 10000+ at the cap of the lists and 1000+ at the cap of a category", () => {
    expect(formatCount(REVIEW_COUNT_CAP, true)).toBe("10000+");
    expect(formatCount(5000, true)).toBe("5000"); // capped elsewhere, this one is exact
    expect(formatCount(CATEGORY_COUNT_CAP, true, CATEGORY_COUNT_CAP)).toBe(
      "1000+",
    );
    expect(formatCount(CATEGORY_COUNT_CAP, true)).toBe("1000"); // the cap of the lists is higher
    expect(formatCount(CATEGORY_COUNT_CAP, false, CATEGORY_COUNT_CAP)).toBe(
      "1000",
    );
  });
});

describe("exportProgress", () => {
  const job = (o: Partial<ExportJob>): ExportJob => ({
    id: "j",
    status: "running",
    createdAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-01-02T00:00:00Z",
    ...o,
  });
  it("counts the part being built, never more than the total", () => {
    expect(exportProgress(job({ total: 100, built: 40, building: 25 }))).toBe(
      65,
    );
    expect(exportProgress(job({ total: 100, built: 40 }))).toBe(40); // protojson leaves out zeros
    expect(exportProgress(job({ total: 100, built: 90, building: 30 }))).toBe(
      100,
    );
    expect(exportProgress(job({ built: 5, building: 2 }))).toBe(7); // the total is not known yet
  });
});
