import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

describe("Switch", () => {
  it("is a switch that reports the opposite value on click", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onChange} aria-label="Export" />);
    const sw = screen.getByRole("switch", { name: "Export" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("shows the checked state and turns off", () => {
    const onChange = vi.fn();
    render(<Switch checked onCheckedChange={onChange} aria-label="Export" />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "true");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("does nothing when disabled", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} disabled onCheckedChange={onChange} aria-label="Export" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
