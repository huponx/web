import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { useLoad } from "./useLoad";

it("keeps the error of the last try until the reload answers", async () => {
  let fail = true;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  const { result } = renderHook(() =>
    useLoad(async () => {
      if (fail) throw new Error("boom");
      await gate;
      return "ok";
    }, []),
  );
  await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
  fail = false;
  act(() => result.current.reload());
  // the reload is running: the error does not flash away
  expect(result.current.error).toBeInstanceOf(Error);
  release();
  await waitFor(() => expect(result.current.data).toBe("ok"));
  expect(result.current.error).toBeUndefined();
});
