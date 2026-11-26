import type { TFunction } from "i18next";
import { formatInterval } from "./interval";

const t = ((k: string, o: { n: number }) =>
  `${o.n}${k.split(".").pop()}`) as unknown as TFunction;

describe("formatInterval", () => {
  it.each([
    [0, "1m"],
    [30, "1m"],
    [600, "10m"],
    [59 * 60, "59m"],
    [3600, "1h"],
    [5 * 3600, "5h"],
    [86400, "1d"],
    [4 * 86400, "4d"],
    [29 * 86400, "29d"],
    [30 * 86400, "1mo"],
    [90 * 86400, "3mo"],
    [364 * 86400, "12mo"],
    [365 * 86400, "1y"],
    [-5, "1m"],
  ])("%d seconds is %s", (seconds, want) => {
    expect(formatInterval(seconds, t)).toBe(want);
  });
});
