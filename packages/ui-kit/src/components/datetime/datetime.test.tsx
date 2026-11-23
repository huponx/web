import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DatePicker, DateTimePicker, TimePicker } from "../../index";
import type { DatePickerProps } from "../../index";
import { parseDate, parseTime, roundTime, splitDateTime, toDateStr } from "./date-utils";

function phone(on: boolean) {
  window.matchMedia = ((q: string) => ({ matches: on, media: q, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
}

function Date_({ initial = "", ...rest }: { initial?: string } & Partial<DatePickerProps>) {
  const [v, setV] = useState(initial);
  return (
    <>
      <DatePicker value={v} onChange={setV} aria-label="Due" locale="en" {...rest} />
      <output data-testid="out">{v}</output>
    </>
  );
}
function Time_({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <TimePicker value={v} onChange={setV} aria-label="At" />
      <output data-testid="out">{v}</output>
    </>
  );
}
function Both({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <DateTimePicker value={v} onChange={setV} aria-label="Starts" locale="en" />
      <output data-testid="out">{v}</output>
    </>
  );
}
const out = () => screen.getByTestId("out").textContent;

beforeEach(() => phone(false));

describe("date helpers", () => {
  it("parses and rejects", () => {
    expect(toDateStr(parseDate("2026-11-23")!)).toBe("2026-11-23");
    expect(parseDate("2026-02-31")).toBeNull();
    expect(parseDate("23/11/2026")).toBeNull();
    expect(parseTime("09:05")).toEqual({ h: 9, m: 5 });
    expect(parseTime("24:00")).toBeNull();
    expect(splitDateTime("2026-11-23T14:30")).toEqual({ date: "2026-11-23", time: "14:30" });
    expect(splitDateTime("junk")).toEqual({ date: "", time: "" });
    expect(roundTime(new Date(2026, 0, 1, 23, 58), 5)).toEqual({ h: 23, m: 55 });
  });
});

describe("DatePicker (desktop)", () => {
  it("opens a popover, picks a day and closes", async () => {
    render(<Date_ initial="2026-11-13" />);
    const user = userEvent.setup();
    expect(screen.getByTestId("picker-value").textContent).toBe("Nov 13, 2026");
    await user.click(screen.getByRole("button", { name: "Due" }));
    const dialog = await screen.findByRole("dialog", { name: "Select date" });
    expect(within(dialog).getByText("November 2026")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: /November 20, 2026/ }));
    expect(out()).toBe("2026-11-20");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves between months and clears", async () => {
    render(<Date_ initial="2026-11-13" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Due" }));
    await user.click(await screen.findByRole("button", { name: "Next month" }));
    expect(screen.getByText("December 2026")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(out()).toBe("");
  });

  it("does not offer days outside min and max", async () => {
    render(<Date_ initial="2026-11-13" min="2026-11-10" max="2026-11-20" />);
    await userEvent.click(screen.getByRole("button", { name: "Due" }));
    expect((await screen.findByRole("button", { name: /November 9, 2026/ })).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /November 15, 2026/ }).hasAttribute("disabled")).toBe(false);
  });

  it("opens where the side and align attributes say", async () => {
    render(<Date_ initial="2026-11-13" side="top" align="end" />);
    await userEvent.click(screen.getByRole("button", { name: "Due" }));
    const dialog = await screen.findByRole("dialog", { name: "Select date" });
    expect(dialog.getAttribute("data-side")).toBe("top");
    expect(dialog.getAttribute("data-align")).toBe("end");
  });

  it("has the popover below and aligned to the start by default", async () => {
    render(<Date_ />);
    await userEvent.click(screen.getByRole("button", { name: "Due" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("data-side")).toBe("bottom");
    expect(dialog.getAttribute("data-align")).toBe("start");
  });

  it("puts the value in a hidden input for a plain form", () => {
    const { container } = render(<DatePicker value="2026-11-13" onChange={() => undefined} name="due" />);
    expect((container.querySelector('input[name="due"]') as HTMLInputElement).value).toBe("2026-11-13");
  });

  it("moves the focus by a day with the arrow keys", async () => {
    render(<Date_ initial="2026-11-13" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Due" }));
    const day = await screen.findByRole("button", { name: /November 13, 2026/ });
    day.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.getAttribute("data-date")).toBe("2026-11-14");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.getAttribute("data-date")).toBe("2026-11-21");
  });
});

describe("TimePicker (desktop)", () => {
  it("applies the picked hour and minute", async () => {
    render(<Time_ initial="14:30" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "At" }));
    const dialog = await screen.findByRole("dialog", { name: "Select time" });
    await user.click(within(within(dialog).getByRole("listbox", { name: "Hour" })).getByRole("option", { name: "09" }));
    await user.click(within(within(dialog).getByRole("listbox", { name: "Minute" })).getByRole("option", { name: "45" }));
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(out()).toBe("09:45");
  });
});

describe("DateTimePicker (desktop)", () => {
  it("needs a day and joins it with the time", async () => {
    render(<Both />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Starts" }));
    const dialog = await screen.findByRole("dialog", { name: "Date and time" });
    expect(within(dialog).getByRole("button", { name: "Apply" }).hasAttribute("disabled")).toBe(true);
    const today = new Date();
    await user.click(within(dialog).getByRole("button", { name: new RegExp(`${today.toLocaleDateString("en", { month: "long" })} ${today.getDate()}, ${today.getFullYear()}`) }));
    await user.click(within(within(dialog).getByRole("listbox", { name: "Hour" })).getByRole("option", { name: "18" }));
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(out()).toBe(`${toDateStr(today)}T18:00`);
  });
});

describe("pickers on a phone", () => {
  beforeEach(() => phone(true));

  it("opens a bottom sheet and commits with Done only", async () => {
    render(<Date_ initial="2026-11-13" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Due" }));
    const sheet = await screen.findByRole("dialog", { name: "Select date" });
    expect(sheet.getAttribute("data-picker")).toBe("sheet");
    await user.click(within(sheet).getByRole("button", { name: /November 20, 2026/ }));
    expect(out()).toBe("2026-11-13");
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(out()).toBe("2026-11-20");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("drops the draft on Cancel", async () => {
    render(<Date_ initial="2026-11-13" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Due" }));
    const sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByRole("button", { name: /November 20, 2026/ }));
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(out()).toBe("2026-11-13");
  });

  it("splits date and time into tabs", async () => {
    render(<Both initial="2026-11-13T09:00" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Starts" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("tab", { name: /Date/ }).getAttribute("aria-selected")).toBe("true");
    await user.click(within(sheet).getByRole("tab", { name: /Time/ }));
    expect(within(sheet).getByRole("listbox", { name: "Hour" })).toBeTruthy();
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(out()).toBe("2026-11-13T09:00");
  });

  it("can force the popover on a phone with variant", async () => {
    render(<Date_ variant="popover" />);
    await userEvent.click(screen.getByRole("button", { name: "Due" }));
    expect((await screen.findByRole("dialog")).getAttribute("data-picker")).toBe("popover");
  });
});
