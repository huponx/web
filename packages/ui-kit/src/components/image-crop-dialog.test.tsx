import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageCropDialog } from "./image-crop-dialog";

const labels = { title: "Crop", hint: "Drag", zoom: "Zoom", cancel: "Cancel", use: "Use", close: "Close" };
const file = new File(["x"], "a.png", { type: "image/png" });

function loaded(w: number, h: number) {
  const img = document.querySelector("img") as HTMLImageElement;
  Object.defineProperty(img, "naturalWidth", { value: w });
  Object.defineProperty(img, "naturalHeight", { value: h });
  fireEvent.load(img);
}

describe("ImageCropDialog", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it("confirms the centered square of a landscape picture by default", () => {
    const onConfirm = vi.fn();
    render(<ImageCropDialog file={file} open onCancel={() => undefined} onConfirm={onConfirm} labels={labels} />);
    loaded(400, 200);
    fireEvent.click(screen.getByTestId("crop-use"));
    expect(onConfirm).toHaveBeenCalledWith({ sx: 100, sy: 0, side: 200 });
  });

  it("zooms with the keyboard and moves with the arrows", () => {
    const onConfirm = vi.fn();
    render(<ImageCropDialog file={file} open onCancel={() => undefined} onConfirm={onConfirm} labels={labels} />);
    loaded(400, 200);
    const frame = screen.getByTestId("crop-frame");
    for (let i = 0; i < 4; i++) fireEvent.keyDown(frame, { key: "+" }); // 2x
    for (let i = 0; i < 100; i++) fireEvent.keyDown(frame, { key: "ArrowRight" }); // the picture goes right: the region reaches the left edge
    fireEvent.click(screen.getByTestId("crop-use"));
    expect(onConfirm).toHaveBeenCalledWith({ sx: 0, sy: 50, side: 100 });
  });

  it("cancel does not confirm", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ImageCropDialog file={file} open onCancel={onCancel} onConfirm={onConfirm} labels={labels} />);
    loaded(200, 200);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("releases the object URL when it closes", () => {
    const { rerender } = render(<ImageCropDialog file={file} open onCancel={() => undefined} onConfirm={() => undefined} labels={labels} />);
    rerender(<ImageCropDialog file={file} open={false} onCancel={() => undefined} onConfirm={() => undefined} labels={labels} />);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });
});
