import { describe, expect, it } from "vitest";
import {
  AudioError,
  audioId,
  audioRef,
  isAudioRef,
  MAX_AUDIO_BYTES,
  readAudio,
} from "./audio";

const ID = "0b8c2d5e-3f4a-4b6c-8d7e-1a2b3c4d5e6f";

describe("audio references", () => {
  it("recognizes only dictaud:<uuid>", () => {
    expect(isAudioRef(`dictaud:${ID}`)).toBe(true);
    for (const v of [
      "",
      "https://x.example/a.mp3",
      "dictaud:",
      "dictaud:nope",
      ` dictaud:${ID}`,
      `dictaud:${ID}x`,
      `dictimg:${ID}`,
    ]) {
      expect(isAudioRef(v)).toBe(false);
    }
    expect(audioId(audioRef(ID))).toBe(ID);
  });
});

describe("readAudio", () => {
  it("reads a supported file as base64, by type or by extension", async () => {
    const byType = await readAudio(
      new File(["abc"], "x.bin", { type: "audio/mpeg" }),
    );
    expect(byType).toEqual({ contentType: "audio/mpeg", data: "YWJj" });
    const byName = await readAudio(
      new File(["abc"], "Voice.M4A", { type: "" }),
    );
    expect(byName.data).toBe("YWJj");
    for (const name of ["a.mp3", "a.ogg", "a.wav"])
      await expect(readAudio(new File(["a"], name))).resolves.toBeDefined();
  });

  it("refuses other files and large ones", async () => {
    await expect(
      readAudio(new File(["x"], "a.png", { type: "image/png" })),
    ).rejects.toMatchObject({ problem: "format" });
    await expect(
      readAudio(new File(["x"], "notes.txt", { type: "text/plain" })),
    ).rejects.toBeInstanceOf(AudioError);
    const big = new File([new Uint8Array(MAX_AUDIO_BYTES + 1)], "big.mp3", {
      type: "audio/mpeg",
    });
    await expect(readAudio(big)).rejects.toMatchObject({ problem: "tooLarge" });
  });
});
