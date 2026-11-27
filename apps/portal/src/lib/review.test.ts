import { formatCount, mergeReviewSummaries, parseReviewSummary, splitInterval } from "./review";

describe("parseReviewSummary", () => {
  it("reads the counts, with int64 as strings", () => {
    expect(
      parseReviewSummary({ newCount: 3, learningCount: "2", dueCount: 5, totalCount: "40", nextDueAt: "2030-01-01T00:00:00Z", newHeld: 1, dueHeld: "4", countsCapped: true, cards: [{ word: "x" }] }),
    ).toEqual({ newCount: 3, learningCount: 2, dueCount: 5, totalCount: 40, nextDueAt: "2030-01-01T00:00:00Z", newHeld: 1, dueHeld: 4, countsCapped: true });
  });

  it("takes a missing field as zero and an empty next due as none", () => {
    expect(parseReviewSummary({ nextDueAt: "" })).toEqual({ newCount: 0, learningCount: 0, dueCount: 0, totalCount: 0, nextDueAt: undefined, newHeld: 0, dueHeld: 0, countsCapped: false });
    expect(parseReviewSummary(undefined).totalCount).toBe(0);
    expect(parseReviewSummary({ newCount: "abc" }).newCount).toBe(0);
  });
});

describe("mergeReviewSummaries", () => {
  it("adds the counts of the groups up and keeps the earliest next due time", () => {
    const a = parseReviewSummary({ newCount: 3, dueCount: 1, totalCount: 10, nextDueAt: "2030-01-02T00:00:00Z", newHeld: 1 });
    const b = parseReviewSummary({ newCount: 2, learningCount: 4, totalCount: 5, nextDueAt: "2030-01-01T00:00:00Z", dueHeld: 2, countsCapped: true });
    expect(mergeReviewSummaries([a, b])).toEqual({ newCount: 5, learningCount: 4, dueCount: 1, totalCount: 15, nextDueAt: "2030-01-01T00:00:00Z", newHeld: 1, dueHeld: 2, countsCapped: true });
    expect(mergeReviewSummaries([])).toEqual(parseReviewSummary({}));
  });
});

describe("formatCount", () => {
  it("shows 10000+ only for a capped count", () => {
    expect(formatCount(10000, true)).toBe("10000+");
    expect(formatCount(10000, false)).toBe("10000");
    expect(formatCount(7, true)).toBe("7");
  });
});

describe("splitInterval", () => {
  it("picks the unit", () => {
    expect(splitInterval(10)).toEqual({ unit: "m", n: 1 });
    expect(splitInterval(5 * 3600)).toEqual({ unit: "h", n: 5 });
    expect(splitInterval(3 * 86400)).toEqual({ unit: "d", n: 3 });
    expect(splitInterval(60 * 86400)).toEqual({ unit: "mo", n: 2 });
    expect(splitInterval(800 * 86400)).toEqual({ unit: "y", n: 2 });
  });
});
