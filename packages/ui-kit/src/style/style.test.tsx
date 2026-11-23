import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StyleProvider, useUIStyle } from "./StyleProvider";

function Probe() {
  const { style, setStyle, palette, setPalette } = useUIStyle();
  return (
    <>
      <p data-testid="probe">{style}</p>
      <p data-testid="palette">{palette}</p>
      <button onClick={() => setPalette("ocean")}>ocean</button>
      <button onClick={() => setPalette("neon" as never)}>neon palette</button>
      <button onClick={() => setStyle("glass")}>glass</button>
      <button onClick={() => setStyle("neon" as never)}>neon</button>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.style;
  delete document.documentElement.dataset.palette;
});

describe("StyleProvider", () => {
  it("defaults to saas and puts it on <html>", () => {
    render(
      <StyleProvider>
        <Probe />
      </StyleProvider>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("saas");
    expect(document.documentElement.dataset.style).toBe("saas");
  });

  it("applies and stores a choice, and ignores an unknown one", async () => {
    render(
      <StyleProvider>
        <Probe />
      </StyleProvider>,
    );
    await userEvent.click(screen.getByText("glass"));
    expect(screen.getByTestId("probe").textContent).toBe("glass");
    expect(document.documentElement.dataset.style).toBe("glass");
    expect(localStorage.getItem("ui-style")).toBe("glass");

    await userEvent.click(screen.getByText("neon"));
    expect(screen.getByTestId("probe").textContent).toBe("glass");
  });

  it("restores the stored style and ignores a bad value", () => {
    localStorage.setItem("ui-style", "mono");
    const { unmount } = render(
      <StyleProvider>
        <Probe />
      </StyleProvider>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("mono");
    unmount();

    localStorage.setItem("ui-style", "purple");
    render(
      <StyleProvider>
        <Probe />
      </StyleProvider>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("saas");
  });

  it("defaults to the aurora palette and puts it on <html>", () => {
    render(
      <StyleProvider>
        <Probe />
      </StyleProvider>,
    );
    expect(screen.getByTestId("palette").textContent).toBe("aurora");
    expect(document.documentElement.dataset.palette).toBe("aurora");
  });

  it("applies and stores a palette, and ignores an unknown one", async () => {
    render(
      <StyleProvider>
        <Probe />
      </StyleProvider>,
    );
    await userEvent.click(screen.getByText("ocean"));
    expect(screen.getByTestId("palette").textContent).toBe("ocean");
    expect(document.documentElement.dataset.palette).toBe("ocean");
    expect(localStorage.getItem("ui-palette")).toBe("ocean");

    await userEvent.click(screen.getByText("neon palette"));
    expect(screen.getByTestId("palette").textContent).toBe("ocean");
  });

  it("restores the stored palette and ignores a bad value", () => {
    localStorage.setItem("ui-palette", "mint");
    const { unmount } = render(
      <StyleProvider>
        <Probe />
      </StyleProvider>,
    );
    expect(screen.getByTestId("palette").textContent).toBe("mint");
    unmount();

    localStorage.setItem("ui-palette", "purple");
    render(
      <StyleProvider>
        <Probe />
      </StyleProvider>,
    );
    expect(screen.getByTestId("palette").textContent).toBe("aurora");
  });
});
