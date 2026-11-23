import { render, screen } from "@testing-library/react";
import { Progress } from "./progress";

describe("Progress", () => {
  it("is a progressbar with its value and a percentage text", () => {
    render(<Progress value={30} max={120} aria-label="Saved" />);
    const bar = screen.getByRole("progressbar", { name: "Saved" });
    expect(bar.getAttribute("aria-valuenow")).toBe("30");
    expect(bar.getAttribute("aria-valuemax")).toBe("120");
    expect(bar.getAttribute("aria-valuetext")).toBe("25%");
  });

  it("clamps the value to the range", () => {
    render(<Progress value={500} aria-label="Over" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  it("has no value while indeterminate", () => {
    render(<Progress aria-label="Working" />);
    expect(screen.getByRole("progressbar").hasAttribute("aria-valuenow")).toBe(false);
  });

  it("fills a bar with a transform, not a width", async () => {
    const { container } = render(<Progress value={50} aria-label="Half" />);
    const fill = container.querySelector("[data-shape=linear] > div") as HTMLElement;
    await vi.waitFor(() => expect(fill.style.transform).toBe("scaleX(0.5)"));
  });

  it("draws a ring whose offset follows the value, and shows the percentage", async () => {
    const { container } = render(<Progress shape="circle" value={75} size={80} strokeWidth={8} showValue aria-label="Ring" />);
    const arc = container.querySelectorAll("circle")[1]!;
    const circumference = 2 * Math.PI * 36;
    await vi.waitFor(() => expect(Number(arc.getAttribute("stroke-dashoffset"))).toBeCloseTo(circumference * 0.25, 3));
    await vi.waitFor(() => expect(screen.getByText("75%")).toBeTruthy());
  });

  it("puts children in the middle of a ring", () => {
    render(<Progress shape="circle" value={10} aria-label="Ring">Done</Progress>);
    expect(screen.getByText("Done")).toBeTruthy();
  });
});
