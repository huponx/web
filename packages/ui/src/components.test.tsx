import { fireEvent, render, screen } from "@testing-library/react";
import { Button, DataTable, ErrorNotice, Layout, Modal, TextField, errorMessage } from "./components";

describe("components", () => {
  it("Layout shows the user and signs out", () => {
    const out = vi.fn();
    render(
      <Layout brand="Dict" user="ann" onLogout={out}>
        content
      </Layout>,
    );
    expect(screen.getByText("ann")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(out).toHaveBeenCalled();
  });

  it("Button is disabled while busy", () => {
    render(<Button busy>Save</Button>);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("TextField links the label and shows the error", () => {
    render(<TextField label="Email" error="required" />);
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("required");
  });

  it("DataTable renders rows and the empty text", () => {
    const cols = [{ header: "Name", cell: (r: { n: string }) => r.n }];
    const { rerender } = render(<DataTable columns={cols} rows={[{ n: "a" }, { n: "b" }]} rowKey={(r) => r.n} />);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    rerender(<DataTable columns={cols} rows={[]} rowKey={(r) => r.n} empty="No rows" />);
    expect(screen.getByText("No rows")).toBeTruthy();
  });

  it("errorMessage and ErrorNotice", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("text")).toBe("text");
    expect(errorMessage(undefined)).toBe("Something went wrong.");
    render(<ErrorNotice error={new Error("bad")} />);
    expect(screen.getByRole("alert").textContent).toBe("bad");
  });

  it("Modal closes with Escape", () => {
    const close = vi.fn();
    render(
      <Modal title="Create" onClose={close}>
        body
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).toHaveBeenCalled();
  });
});
