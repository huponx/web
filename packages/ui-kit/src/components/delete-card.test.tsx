import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeleteCard } from "./delete-card";

describe("DeleteCard", () => {
  it("shows the texts and calls onDelete from the button", () => {
    const onDelete = vi.fn();
    render(<DeleteCard title="Delete role" description="Cannot be undone" label="Delete" onDelete={onDelete}><p>dialog</p></DeleteCard>);
    expect(screen.getByText("Cannot be undone")).toBeTruthy();
    expect(screen.getByText("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalled();
  });

  it("disables the button", () => {
    render(<DeleteCard title="t" description="d" label="Delete" onDelete={() => undefined} disabled />);
    expect((screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
