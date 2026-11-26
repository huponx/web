import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportJob } from "../api";
import { EXPORT_POLL_MS, useExportJob } from "./useExportJob";

const job = (status: ExportJob["status"], built = 0): ExportJob => ({
  id: "j1",
  status,
  total: 10,
  built,
  createdAt: "2026-01-01T00:00:00Z",
  expiresAt: "2026-01-02T00:00:00Z",
});

describe("useExportJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("shows a running job found on load, polls it, and stops when it is done", async () => {
    const getExport = vi
      .fn<(id?: string) => Promise<ExportJob | undefined>>()
      .mockResolvedValueOnce(job("running", 2)) // "latest" on load
      .mockResolvedValueOnce(job("running", 6))
      .mockResolvedValueOnce(job("done", 10));
    const { result } = renderHook(() =>
      useExportJob({ getExport, cancelExport: vi.fn() }, true),
    );
    await act(async () => {});
    expect(result.current.job?.built).toBe(2);
    await act(() => vi.advanceTimersByTimeAsync(EXPORT_POLL_MS));
    expect(result.current.job?.built).toBe(6);
    await act(() => vi.advanceTimersByTimeAsync(EXPORT_POLL_MS));
    expect(result.current.job?.status).toBe("done");
    const calls = getExport.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(EXPORT_POLL_MS * 3));
    expect(getExport).toHaveBeenCalledTimes(calls); // done: no more polling
    expect(getExport).toHaveBeenNthCalledWith(1, "latest");
    expect(getExport).toHaveBeenNthCalledWith(2, "j1");
  });

  it("shows a finished job again after a reload, until the user closes it", async () => {
    window.localStorage.clear();
    const getExport = vi.fn().mockResolvedValue(job("done", 10));
    const api = { getExport, cancelExport: vi.fn() };
    const first = renderHook(() => useExportJob(api, true));
    await act(async () => {});
    expect(first.result.current.job?.status).toBe("done"); // its parts are still there to download
    act(() => first.result.current.dismiss());
    expect(first.result.current.job).toBeUndefined();
    first.unmount();
    // the page is opened again: the closed job stays closed
    const second = renderHook(() => useExportJob(api, true));
    await act(async () => {});
    expect(second.result.current.job).toBeUndefined();
    // a newer job is not the closed one
    getExport.mockResolvedValue({ ...job("done", 5), id: "j2" });
    const third = renderHook(() => useExportJob(api, true));
    await act(async () => {});
    expect(third.result.current.job?.id).toBe("j2");
  });

  it("does nothing when it is not enabled, and cancel takes the answer", async () => {
    const getExport = vi.fn();
    const cancelExport = vi.fn().mockResolvedValue(job("cancelled", 4));
    const off = renderHook(() =>
      useExportJob({ getExport, cancelExport }, false),
    );
    await act(async () => {});
    expect(getExport).not.toHaveBeenCalled();
    expect(off.result.current.job).toBeUndefined();

    const { result } = renderHook(() =>
      useExportJob({ getExport, cancelExport }, false),
    );
    act(() => result.current.set(job("running", 1)));
    await act(() => result.current.cancel());
    expect(cancelExport).toHaveBeenCalledWith("j1");
    expect(result.current.job?.status).toBe("cancelled");
  });
});
