import { formatDate, formatDateTime, fromUnix } from "./date";

describe("date helpers", () => {
  it("treats 0, empty and garbage as never", () => {
    expect(fromUnix("0")).toBeUndefined();
    expect(fromUnix(undefined)).toBeUndefined();
    expect(fromUnix("x")).toBeUndefined();
    expect(formatDateTime("0", "en")).toBeUndefined();
  });
  it("reads the seconds of a number or of an int64 string", () => {
    expect(fromUnix("86400")?.getTime()).toBe(86400_000);
    expect(fromUnix(86400)?.getTime()).toBe(86400_000);
    expect(formatDate("1700000000", "en")).toMatch(/2023/);
    expect(formatDateTime("1700000000", "en")).toMatch(/2023/);
  });
});
