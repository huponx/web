import { formatBytes } from "./bytes";

describe("formatBytes", () => {
  it("uses binary units with at most one decimal", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(64 * 1024)).toBe("64 KiB");
    expect(formatBytes(12.4 * 1024 * 1024)).toBe("12.4 MiB");
    expect(formatBytes(256 * 1024 * 1024)).toBe("256 MiB");
    expect(formatBytes(1024 ** 3)).toBe("1 GiB");
    expect(formatBytes(-5)).toBe("0 B");
  });
});
