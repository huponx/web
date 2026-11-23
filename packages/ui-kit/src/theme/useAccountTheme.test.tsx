import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import { useAccountTheme } from "./useAccountTheme";

function Probe({ account, save }: { account: string | undefined; save: (t: string) => Promise<unknown> }) {
  useAccountTheme(account, save);
  const { theme, setTheme } = useTheme();
  return (
    <button type="button" onClick={() => setTheme("dark")}>
      {theme}
    </button>
  );
}

describe("useAccountTheme", () => {
  it("applies the theme of the account once and does not save it back", async () => {
    window.localStorage.setItem("theme", "dark");
    const save = vi.fn(() => Promise.resolve());
    render(
      <ThemeProvider>
        <Probe account="light" save={save} />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByRole("button").textContent).toBe("light"));
    expect(save).not.toHaveBeenCalled();
  });

  it("saves a later change of the switch", async () => {
    window.localStorage.setItem("theme", "light");
    const save = vi.fn(() => Promise.resolve());
    render(
      <ThemeProvider>
        <Probe account="light" save={save} />
      </ThemeProvider>,
    );
    screen.getByRole("button").click();
    await waitFor(() => expect(save).toHaveBeenCalledWith("dark"));
  });

  it("keeps the browser theme when the account never chose, and saves it to the account", async () => {
    window.localStorage.setItem("theme", "dark");
    const save = vi.fn(() => Promise.resolve());
    render(
      <ThemeProvider>
        <Probe account="" save={save} />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button").textContent).toBe("dark");
    await waitFor(() => expect(save).toHaveBeenCalledWith("dark"));
  });

  it("does nothing until the account is read", () => {
    const save = vi.fn(() => Promise.resolve());
    render(
      <ThemeProvider>
        <Probe account={undefined} save={save} />
      </ThemeProvider>,
    );
    expect(save).not.toHaveBeenCalled();
  });
});
