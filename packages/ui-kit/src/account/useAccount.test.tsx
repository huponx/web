import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rememberLanguageChoice, useAccountLocale, useAccountProfile } from "./useAccount";

function Locale({ account, current, apply }: { account?: string; current: string; apply: (c: string) => void }) {
  useAccountLocale(account, current, ["en", "vi"], apply, "lang");
  return null;
}

function Profile({ load }: { load: () => Promise<{ name: string } | undefined> }) {
  const p = useAccountProfile("u1", load);
  return <p>{p?.name ?? "none"}</p>;
}

describe("useAccountLocale", () => {
  beforeEach(() => window.localStorage.clear());

  it("applies the account language when this browser never chose", () => {
    const apply = vi.fn();
    render(<Locale account="vi" current="en" apply={apply} />);
    expect(apply).toHaveBeenCalledWith("vi");
  });

  it("keeps the browser choice while the account did not change", () => {
    rememberLanguageChoice("lang", "en");
    const apply = vi.fn();
    render(<Locale account="en" current="vi" apply={apply} />);
    expect(apply).not.toHaveBeenCalled();
  });

  it("applies a language another app saved, even over a browser choice", () => {
    rememberLanguageChoice("lang", "en");
    const apply = vi.fn();
    render(<Locale account="vi" current="en" apply={apply} />);
    expect(apply).toHaveBeenCalledWith("vi");
  });

  it("ignores a language the app does not have", () => {
    const apply = vi.fn();
    render(<Locale account="fr" current="en" apply={apply} />);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("useAccountProfile", () => {
  it("reads the profile of the user", async () => {
    const { findByText } = render(<Profile load={() => Promise.resolve({ name: "Ann" })} />);
    expect(await findByText("Ann")).toBeTruthy();
  });

  it("stays empty when the read fails", async () => {
    const load = vi.fn(() => Promise.reject(new Error("x")));
    const { getByText } = render(<Profile load={load} />);
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(getByText("none")).toBeTruthy();
  });
});
