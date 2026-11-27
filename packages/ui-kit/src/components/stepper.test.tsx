import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stepper } from "./stepper";

describe("Stepper", () => {
  it("marks the current step and shows a check on the done ones", () => {
    render(<Stepper steps={["Connect", "Verify", "Save codes"]} current={2} label="Steps" />);
    const items = Array.from(screen.getByRole("list", { name: "Steps" }).querySelectorAll("li"));
    expect(items).toHaveLength(3);
    expect(items[1]!.getAttribute("aria-current")).toBe("step");
    expect(items[0]!.getAttribute("aria-current")).toBeNull();
    expect(items[0]!.querySelector("svg")).not.toBeNull();
    expect(items[2]!.textContent).toBe("3Save codes");
  });
});
