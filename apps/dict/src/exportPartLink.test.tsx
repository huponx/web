import { AuthProvider, createClient } from "@huponx/auth-client";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useDictionary } from "./api";

describe("exportPartLink", () => {
  it("points at the streamed download of a part, not at the deck download", async () => {
    const calls: string[] = [];
    const client = createClient({
      apiBase: "https://api.example.com",
      fetch: async (input, init) => {
        const url = new URL(String(input));
        calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
        if (url.pathname === "/auth/me")
          return new Response(
            JSON.stringify({
              sub: "ann",
              roles: [],
              scopes: [],
              perms: [],
              amr: [],
              csrf_token: "c",
              expires_at: "2030-01-01T00:00:00Z",
            }),
            { status: 200 },
          );
        return new Response(
          JSON.stringify({ token: "tok/1", filename: "D (part 1).apkg" }),
          { status: 200 },
        );
      },
      navigate: () => undefined,
      storage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider client={client}>{children}</AuthProvider>
    );
    const { result } = renderHook(() => useDictionary(), { wrapper });
    await waitFor(() => expect(result.current).toBeTruthy());
    const link = await result.current.exportPartLink("job 1", 2);
    expect(link.url).toBe(
      "https://api.example.com/api/dictionary/export-downloads/tok%2F1.apkg",
    );
    expect(calls).toContain(
      "POST /api/dictionary/exports/job%201/parts/2/link",
    );
  });
});
