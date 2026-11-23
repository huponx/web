import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import { ThemeSwitch } from "./ThemeSwitch";
import { TooltipProvider } from "../components/ui/tooltip";

const labels = { group: "Theme", light: "Light", dark: "Dark", system: "System" };

function Probe() {
  const { theme, resolved } = useTheme();
  return <p data-testid="probe">{`${theme}/${resolved}`}</p>;
}

function mockSystem(dark: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches: dark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  window.matchMedia = (() => mq) as unknown as typeof window.matchMedia;
  return {
    set(next: boolean) {
      mq.matches = next;
      listeners.forEach((l) => l());
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
});

describe("ThemeProvider", () => {
  it("follows the system by default and reacts to a change of the system", async () => {
    const sys = mockSystem(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("system/light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    act(() => sys.set(true));
    expect(await screen.findByText("system/dark")).toBeTruthy();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("applies and stores the choice of the switch", async () => {
    mockSystem(false);
    render(
      <ThemeProvider>
        <TooltipProvider>
          <ThemeSwitch labels={labels} />
        </TooltipProvider>
        <Probe />
      </ThemeProvider>,
    );
    // one button, the icon is the current theme; a click moves on: system -> light -> dark -> system
    const button = screen.getByRole("button", { name: "Theme: System" });
    await userEvent.click(button);
    expect(screen.getByTestId("probe").textContent).toBe("light/light");
    expect(localStorage.getItem("theme")).toBe("light");
    expect(screen.getByRole("button", { name: "Theme: Light" })).toBeTruthy();

    await userEvent.click(button);
    expect(screen.getByTestId("probe").textContent).toBe("dark/dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");

    await userEvent.click(button);
    expect(screen.getByTestId("probe").textContent).toBe("system/light");
    expect(localStorage.getItem("theme")).toBe("system");
  });

  it("restores the stored choice and ignores a bad value", () => {
    mockSystem(false);
    localStorage.setItem("theme", "dark");
    const { unmount } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("dark/dark");
    unmount();

    localStorage.setItem("theme", "purple");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("system/light");
  });
});
