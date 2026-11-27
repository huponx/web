import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SplitButton } from "./split-button";

describe("SplitButton", () => {
  it("runs the first action on a click and the others from the menu", async () => {
    const approve = vi.fn();
    const reject = vi.fn();
    render(
      <SplitButton
        menuLabel="More actions"
        actions={[
          { key: "approve", label: "Approve", onSelect: approve },
          { key: "reject", label: "Reject", onSelect: reject, destructive: true },
        ]}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(reject).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Reject" }));
    expect(reject).toHaveBeenCalledTimes(1);
  });

  it("has no menu with a single action", () => {
    render(<SplitButton menuLabel="More actions" actions={[{ key: "a", label: "Only", onSelect: () => undefined }]} />);
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });
});
