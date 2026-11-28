import { act, renderHook, waitFor } from "@testing-library/react";
import { toItem, useNotifications } from "./notifications";
import type { AuthClient } from "./client";

class FakeEventSource {
  static last: FakeEventSource | undefined;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  closed = false;
  constructor(
    public url: string,
    public init?: EventSourceInit,
  ) {
    FakeEventSource.last = this;
  }
  close() {
    this.closed = true;
  }
  send(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}

function fakeClient(handler: (method: string, path: string, body?: unknown) => unknown) {
  const calls: string[] = [];
  const client = {
    apiBase: "https://api.example.com",
    api: async (method: string, path: string, body?: unknown) => {
      calls.push(`${method} ${path}`);
      return handler(method, path, body);
    },
  } as unknown as AuthClient;
  return { client, calls };
}

const wire = (id: string, extra: object = {}) => ({ id, title: `t${id}`, body: "", link: "", severity: "SEVERITY_INFO", read: false, createdAt: "100", ...extra });

beforeEach(() => {
  FakeEventSource.last = undefined;
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("toItem", () => {
  it("reads protojson: int64 as a string, the severity by name", () => {
    expect(toItem(wire("1", { severity: "SEVERITY_CRITICAL", createdAt: "1700000000", read: true }))).toMatchObject({ severity: "critical", createdAt: 1700000000, read: true });
    expect(toItem({ id: "2" })).toMatchObject({ severity: "info", read: false, title: "", createdAt: 0 });
  });
});

describe("useNotifications", () => {
  it("does nothing while disabled", () => {
    const { client, calls } = fakeClient(() => ({}));
    renderHook(() => useNotifications(client, { enabled: false }));
    expect(calls).toEqual([]);
    expect(FakeEventSource.last).toBeUndefined();
  });

  it("loads the list and opens the stream with the session cookie", async () => {
    const { client } = fakeClient(() => ({ items: [wire("1"), wire("2", { read: true })], unread: 1, nextPageToken: "n1" }));
    const { result } = renderHook(() => useNotifications(client));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current).toMatchObject({ unread: 1, hasMore: true });
    expect(FakeEventSource.last?.url).toBe("https://api.example.com/api/notifications/stream");
    expect(FakeEventSource.last?.init?.withCredentials).toBe(true);
  });

  it("puts a new item first and takes the count from the stream", async () => {
    const { client } = fakeClient(() => ({ items: [wire("1")], unread: 1 }));
    const { result } = renderHook(() => useNotifications(client));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    act(() => FakeEventSource.last!.onopen?.());
    expect(result.current.live).toBe(true);
    act(() => FakeEventSource.last!.send({ unread: 2, item: wire("2") }));
    expect(result.current.items.map((i) => i.id)).toEqual(["2", "1"]);
    expect(result.current.unread).toBe(2);
    act(() => FakeEventSource.last!.send({ unread: 2, item: wire("2") })); // the same item twice is shown once
    expect(result.current.items).toHaveLength(2);
    act(() => FakeEventSource.last!.send({ heartbeat: true, unread: 0 }));
    expect(result.current.unread).toBe(2);
  });

  it("reloads when another tab changed the count", async () => {
    let unread = 1;
    const { client, calls } = fakeClient(() => ({ items: [wire("1", { read: unread === 0 })], unread }));
    const { result } = renderHook(() => useNotifications(client));
    await waitFor(() => expect(result.current.unread).toBe(1));
    unread = 0;
    act(() => FakeEventSource.last!.send({ unread: 0 }));
    await waitFor(() => expect(result.current.items[0]?.read).toBe(true));
    expect(calls.filter((c) => c.startsWith("GET /api/notifications?")).length).toBe(2);
  });

  it("marks read at once and takes the count of the server", async () => {
    const { client, calls } = fakeClient((m) => (m === "GET" ? { items: [wire("1"), wire("2")], unread: 2 } : { unread: 1 }));
    const { result } = renderHook(() => useNotifications(client));
    await waitFor(() => expect(result.current.unread).toBe(2));
    await act(() => result.current.markRead(["1"]));
    expect(result.current.items.find((i) => i.id === "1")?.read).toBe(true);
    expect(result.current.unread).toBe(1);
    expect(calls).toContain("POST /api/notifications/read");
    await act(() => result.current.archive("2"));
    expect(result.current.items.map((i) => i.id)).toEqual(["1"]);
  });

  it("polls the count while the stream is down, and stops when it is up", async () => {
    vi.useFakeTimers();
    const { client, calls } = fakeClient((m, p) => (p.includes("unread-count") ? { unread: 0 } : { items: [], unread: 0 }));
    renderHook(() => useNotifications(client, { pollMs: 1000 }));
    await act(() => vi.advanceTimersByTimeAsync(2100));
    expect(calls.filter((c) => c.includes("unread-count")).length).toBe(2);
    act(() => FakeEventSource.last!.onopen?.());
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(calls.filter((c) => c.includes("unread-count")).length).toBe(2);
  });

  it("closes the stream on unmount", () => {
    const { client } = fakeClient(() => ({ items: [], unread: 0 }));
    const { unmount } = renderHook(() => useNotifications(client));
    const es = FakeEventSource.last!;
    unmount();
    expect(es.closed).toBe(true);
  });
});
