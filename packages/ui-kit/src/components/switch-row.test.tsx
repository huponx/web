import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SwitchRow } from "./switch-row";

describe("SwitchRow", () => {
  it("names the switch by its label and reports the opposite value", () => {
    const onChange = vi.fn();
    render(<SwitchRow label="Export" hint="Download a file" checked={false} onChange={onChange} />);
    expect(screen.getByText("Download a file")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Export" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("shows the extra part and can be disabled", () => {
    render(<SwitchRow label="English" checked={false} onChange={() => undefined} disabled extra={<em>Locked</em>} />);
    expect(screen.getByText("Locked")).toBeTruthy();
    expect((screen.getByRole("switch", { name: "English" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
