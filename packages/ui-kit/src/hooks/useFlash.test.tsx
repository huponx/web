import { render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useFlash } from "./useFlash";

function Probe() {
  const flash = useFlash<{ deleted?: string }>();
  const location = useLocation();
  return (
    <>
      <p data-testid="flash">{flash?.deleted ?? "none"}</p>
      <p data-testid="state">{location.state ? "set" : "empty"}</p>
    </>
  );
}

describe("useFlash", () => {
  it("keeps the message for the page but drops it from the history entry, so a refresh does not show it again", async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/roles", state: { deleted: "support" } }]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("flash").textContent).toBe("support");
    expect(await screen.findByText("empty")).toBeTruthy();
    expect(screen.getByTestId("flash").textContent).toBe("support");
  });

  it("is empty when there is no message", () => {
    render(
      <MemoryRouter initialEntries={["/roles"]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("flash").textContent).toBe("none");
  });
});
