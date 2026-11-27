import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SessionsPanel, relativeTime } from "./sessions-panel";
import type { SessionItem, SessionsPanelLabels } from "./sessions-panel";

const labels: SessionsPanelLabels = {
  none: "No sessions",
  thisDevice: "This device",
  unknownDevice: "Unknown device",
  browserOnOs: (b, o) => `${b} on ${o}`,
  lastActive: (w) => `last active ${w}`,
  signedIn: (d) => `signed in ${d}`,
  password: "Password",
  otp: "Authenticator code",
  passkey: "Passkey",
  actions: (d) => `Actions for ${d}`,
  revoke: "Sign out this session",
  revokeOthers: "Sign out of all other sessions",
  confirmRevoke: (d) => `End ${d}?`,
  confirmRevokeCurrent: (d) => `End ${d}? You are signed out now.`,
  confirmRevokeOthers: "End every other session?",
  confirm: { title: "Are you sure?", confirm: "OK", cancel: "Cancel", close: "Close" },
};

const NOW = Date.UTC(2026, 2, 10, 12, 0, 0);
const sec = (ms: number) => String(Math.floor(ms / 1000));
const here: SessionItem = { id: "a", ip: "10.0.0.1", browser: "Chrome", os: "macOS", device: "desktop", amr: ["pwd", "otp"], createdAt: sec(NOW - 86400_000 * 3), lastSeenAt: sec(NOW - 5 * 60_000), current: true };
const phone: SessionItem = { id: "b", ip: "10.0.0.2", browser: "Safari", os: "iOS", device: "mobile", amr: ["pwd", "swk", "mfa"], createdAt: sec(NOW - 86400_000), lastSeenAt: sec(NOW - 3600_000) };
const old: SessionItem = { id: "c" };

describe("relativeTime", () => {
  it("picks the unit", () => {
    expect(relativeTime(Math.floor(NOW / 1000) - 5, NOW, "en")).toBe("now");
    expect(relativeTime(Math.floor((NOW - 5 * 60_000) / 1000), NOW, "en")).toBe("5 minutes ago");
    expect(relativeTime(Math.floor((NOW - 3 * 3600_000) / 1000), NOW, "en")).toBe("3 hours ago");
    expect(relativeTime(Math.floor((NOW - 2 * 86400_000) / 1000), NOW, "en")).toBe("2 days ago");
  });
});

describe("SessionsPanel", () => {
  it("shows the device, the details and the badge of this device", () => {
    render(<SessionsPanel sessions={[here, phone, old]} language="en" labels={labels} now={NOW} />);
    const rows = screen.getAllByTestId("session-row").map((r) => r.textContent ?? "");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("Chrome on macOS");
    expect(rows[0]).toContain("This device");
    expect(rows[0]).toContain("10.0.0.1");
    expect(rows[0]).toContain("last active 5 minutes ago");
    expect(rows[0]).toContain("Password + Authenticator code");
    expect(rows[1]).toContain("Safari on iOS");
    expect(rows[1]).not.toContain("This device");
    expect(rows[1]).toContain("Passkey");
    expect(rows[2]).toContain("Unknown device");
  });

  it("says so when there is none", () => {
    render(<SessionsPanel sessions={[]} language="en" labels={labels} now={NOW} />);
    expect(screen.getByText("No sessions")).toBeTruthy();
  });

  it("has no menu and no button when read-only", () => {
    render(<SessionsPanel sessions={[here, phone]} language="en" labels={labels} now={NOW} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("has no 'others' button when the current session is alone", () => {
    render(<SessionsPanel sessions={[here]} language="en" labels={labels} now={NOW} onRevoke={vi.fn()} onRevokeOthers={vi.fn()} />);
    expect(screen.queryByRole("button", { name: labels.revokeOthers })).toBeNull();
  });

  it("asks before ending another session, with the plain wording", async () => {
    const onRevoke = vi.fn();
    render(<SessionsPanel sessions={[here, phone]} language="en" labels={labels} now={NOW} onRevoke={onRevoke} />);
    await userEvent.click(screen.getByRole("button", { name: "Actions for Safari on iOS" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: labels.revoke }));
    expect(await screen.findByText("End Safari on iOS?")).toBeTruthy();
    expect(onRevoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("confirm-ok"));
    await waitFor(() => expect(onRevoke).toHaveBeenCalledWith(phone));
  });

  it("warns that ending the current session signs out now, and does nothing when cancelled", async () => {
    const onRevoke = vi.fn();
    render(<SessionsPanel sessions={[here, phone]} language="en" labels={labels} now={NOW} onRevoke={onRevoke} />);
    await userEvent.click(screen.getByRole("button", { name: "Actions for Chrome on macOS" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: labels.revoke }));
    expect(await screen.findByText("End Chrome on macOS? You are signed out now.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByTestId("confirm-ok")).toBeNull());
    expect(onRevoke).not.toHaveBeenCalled();
  });

  it("ends the other sessions after a confirmation", async () => {
    const onRevokeOthers = vi.fn();
    render(<SessionsPanel sessions={[here, phone]} language="en" labels={labels} now={NOW} onRevokeOthers={onRevokeOthers} />);
    await userEvent.click(screen.getByRole("button", { name: labels.revokeOthers }));
    expect(await screen.findByText("End every other session?")).toBeTruthy();
    fireEvent.click(screen.getByTestId("confirm-ok"));
    await waitFor(() => expect(onRevokeOthers).toHaveBeenCalled());
  });
});
