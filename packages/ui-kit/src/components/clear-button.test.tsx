import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { TextField } from "./page-parts";
import { TooltipProvider } from "./ui/tooltip";

function Form() {
  const [v, setV] = useState("aa");
  return (
    <TooltipProvider>
      <TextField label="Email" value={v} onChange={(e) => setV(e.target.value)} />
      <input aria-label="Next field" />
    </TooltipProvider>
  );
}

describe("the clear button of a text field", () => {
  it("is not a tab stop: Tab goes from the field to the next field", async () => {
    render(<Form />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Email"));
    await user.tab();
    expect(screen.getByLabelText("Next field")).toHaveFocus();
  });

  it("still clears the field when clicked", async () => {
    render(<Form />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Clear/ }));
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });
});
