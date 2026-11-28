import { AuthProvider, createClient } from "@huponx/auth-client";
import type { Me } from "@huponx/auth-client";
import { StyleProvider, ThemeProvider } from "@huponx/ui-kit";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { App } from "./App";
import { clearImageCache } from "./api";
import { downscaleImage } from "./lib/image";
import { ImageError } from "./lib/image";
import { vi } from "vitest";
import type * as AudioUrl from "./lib/audioUrl";
import { probeAudio } from "./lib/audioUrl";
import { fireEvent } from "@testing-library/react";
import type { DictionaryGroup } from "./api";
import { allowedOf } from "./test-rules";

// a jsdom audio element never loads: the check of an audio address is answered by the tests
vi.mock("./lib/audioUrl", async (orig) => ({
  ...(await orig<typeof AudioUrl>()),
  probeAudio: vi.fn(async () => true),
}));

const word = {
  text: "hello",
  phonetic: "",
  phoneticUk: "/həˈləʊ/",
  phoneticUs: "/həˈloʊ/",
  audioUk: "https://api.dictionaryapi.dev/uk.mp3",
  audioUs: "",
  partOfSpeech: ["exclamation"],
  meanings: [
    {
      definition: "used as a greeting",
      examples: ["Hello, John!"],
      machineTranslated: false,
    },
  ],
};

interface Call {
  method: string;
  path: string;
  body?: unknown;
}

const dictionary = (id: string, group: string, source: string, target: string) => ({
  id,
  group,
  source,
  target,
  enabled: true,
});

/** The registry the service answers by default: one group with the two dictionaries. */
const EN_GROUP: DictionaryGroup = {
  id: "en",
  dictionaries: [
    dictionary("english", "en", "en", "en"),
    dictionary("english-vietnamese", "en", "en", "vi"),
  ],
};

/** A made up group with a dictionary no renderer knows, to prove that nothing is hard-coded. */
const X_GROUP: DictionaryGroup = {
  id: "x",
  dictionaries: [dictionary("test-x", "x", "xx", "xx")],
};

function setup(
  perms: string[],
  route: (
    c: Call,
  ) =>
    | { status?: number; body: unknown; wait?: Promise<unknown> }
    | undefined = () => undefined,
  start = "/",
  groups: DictionaryGroup[] = [EN_GROUP],
) {
  const calls: Call[] = [];
  const me: Me = {
    sub: "ann",
    roles: [],
    scopes: [],
    perms,
    allowed: allowedOf(perms),
    amr: [],
    csrf_token: "c",
    expires_at: "2030-01-01T00:00:00Z",
  };
  const client = createClient({
    apiBase: "https://api.example.com",
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/me")
        return new Response(JSON.stringify(me), { status: 200 });
      // read at start-up by every user, not a call the tests count
      if (url.pathname === "/api/ui-style")
        return new Response(
          JSON.stringify({ uiStyle: "saas", uiPalettes: {} }),
          { status: 200 },
        );
      // the registry is read at start-up by every user, not a call the tests count
      if (url.pathname === "/api/dictionary/dictionaries")
        return new Response(JSON.stringify({ groups }), { status: 200 });
      // which of the words are saved: answered from the list the test serves for GET /saved (not a counted call)
      if (
        init?.method === "POST" &&
        url.pathname === "/api/dictionary/saved/check"
      ) {
        const asked = JSON.parse(String(init.body)) as {
          words: string[];
          group: string;
        };
        const names = (asked.words ?? []).map((w) => w.trim().toLowerCase());
        const list = route({
          method: "GET",
          path: `/api/dictionary/saved?group=${asked.group}&pageSize=50`,
        });
        // a test that serves no list has no server memory of the saves: the check fails, and the page keeps what it knows
        if (!list) return new Response("{}", { status: 500 });
        const rows =
          (
            list?.body as
              { words?: { word: string; categoryIds?: string[] }[] } | undefined
          )?.words ?? [];
        const words = rows
          .filter((w) => names.includes(w.word.toLowerCase()))
          .map((w) => ({ word: w.word, categoryIds: w.categoryIds }));
        return new Response(JSON.stringify({ words }), { status: 200 });
      }
      const call: Call = {
        method: init?.method ?? "GET",
        path: url.pathname + url.search,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      const r = route(call);
      if (!r) return new Response("{}", { status: 200 });
      if (r.wait) await r.wait; // a call that is still running
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
    },
    navigate: () => undefined,
    storage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  });
  render(
    <ThemeProvider>
      <StyleProvider>
        <AuthProvider client={client}>
          <RouterProvider
            router={createMemoryRouter([{ path: "*", element: <App /> }], {
              initialEntries: [start],
            })}
          />
        </AuthProvider>
      </StyleProvider>
    </ThemeProvider>,
  );
  return calls;
}

/** Presses a button of the export dialog ("Download file" or "Get Anki link"). */
async function confirmExport(
  user: ReturnType<typeof userEvent.setup>,
  name = "Download file",
) {
  const dialog = await screen.findByRole("dialog");
  await user.click(await within(dialog).findByRole("button", { name }));
}

describe("dict app", () => {
  it("shows the menu only with the read permission", async () => {
    setup([]);
    expect(
      await screen.findByText("You are not allowed to see this page."),
    ).toBeTruthy();
    expect(screen.queryByTestId("nav-lookup")).toBeNull();
  });

  it("looks a word up and renders its entry", async () => {
    const calls = setup(["dictionary:word:read"], (c) =>
      c.path.startsWith("/api/dictionary/words/")
        ? { body: { word } }
        : undefined,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText("used as a greeting")).toBeTruthy();
    expect(screen.getByText("Hello, John!")).toBeTruthy();
    expect(
      calls.some(
        (c) =>
          c.path ===
          "/api/dictionary/words/hello?dictionary=english",
      ),
    ).toBe(true);
    // reading only: no Save button
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("looks several words up with the chosen dictionary and lists the missing ones", async () => {
    const calls = setup(["dictionary:word:read"], (c) =>
      c.path === "/api/dictionary/lookup"
        ? { body: { words: [word], notFound: ["zzz"] } }
        : undefined,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello, zzz");
    await user.click(screen.getByRole("tab", { name: "English - Vietnamese" })); // nothing looked up yet: no call
    expect(calls.some((c) => c.path === "/api/dictionary/lookup")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText("No entry for: zzz")).toBeTruthy();
    expect(
      calls.find((c) => c.path === "/api/dictionary/lookup")?.body,
    ).toEqual({
      words: ["hello", "zzz"],
      dictionary: "english-vietnamese",
    });

    // after a lookup, switching the dictionary looks the same words up again
    await user.click(screen.getByRole("tab", { name: "English" }));
    await waitFor(() =>
      expect(
        calls.filter((c) => c.path === "/api/dictionary/lookup"),
      ).toHaveLength(2),
    );
    expect(
      calls.filter((c) => c.path === "/api/dictionary/lookup")[1]?.body,
    ).toEqual({ words: ["hello", "zzz"], dictionary: "english" });
  });

  it("saves the card with the audio placeholders and shows the limit error", async () => {
    let saved = 0;
    const calls = setup(["dictionary:word:*"], (c) => {
      if (c.path.startsWith("/api/dictionary/words/"))
        return { body: { word } };
      if (c.method === "POST" && c.path === "/api/dictionary/saved") {
        saved++;
        return saved === 1
          ? { body: { savedCount: 1 } }
          : {
              status: 429,
              body: {
                error: {
                  code: "rate_limited",
                  message: "MAX_SAVED_WORDS_REACHED: 100",
                },
              },
            };
      }
      return undefined;
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText('Saved "hello" (1/100).')).toBeTruthy();
    const body = calls.find((c) => c.method === "POST")?.body as {
      word: string;
      content: string;
      audioUk: string;
    };
    expect(body.word).toBe("hello");
    expect(body.content).toContain("replace_audio_uk");
    // both dictionaries are on the card, separated by a rule
    expect(body.content).toContain("<hr>");
    const lookups = calls
      .filter((c) => c.path.startsWith("/api/dictionary/words/hello"))
      .map((c) => c.path);
    expect(lookups).toContain(
      "/api/dictionary/words/hello?dictionary=english-vietnamese",
    );
    expect(body.audioUk).toBe("https://api.dictionaryapi.dev/uk.mp3");

    // the word is saved now: the button says that saving again overwrites it
    await user.click(screen.getByRole("button", { name: "Save override" }));
    await waitFor(() =>
      expect(screen.getByText(/reached the limit of saved words/)).toBeTruthy(),
    );
  });

  it("shows the saved words next to the lookup", async () => {
    const saved = {
      words: [
        {
          word: "apple",
          content: "",
          audioUk: "",
          audioUs: "",
          createdAt: "2026-11-23T05:00:00Z",
        },
      ],
      nextPageToken: "",
      total: 1,
    };
    setup(["dictionary:word:read"], (c) =>
      c.path.startsWith("/api/dictionary/saved") ? { body: saved } : undefined,
    );
    expect(await screen.findByText("apple")).toBeTruthy();
    expect(screen.getByText(/1 of 100 saved words/)).toBeTruthy();
  });

  it("shows the card of a saved word as HTML, cut short, and the whole card in a dialog on click", async () => {
    const user = userEvent.setup();
    const content =
      "<div>UK /a/ replace_audio_uk</div><ol><li>a fruit<ul><li><i>an apple a day</i></li></ul></li></ol><script>window.hacked=1</script>";
    const saved = {
      words: [
        {
          word: "apple",
          content,
          audioUk: "",
          audioUs: "",
          createdAt: "2026-11-23T05:00:00Z",
        },
      ],
      nextPageToken: "",
      totalCount: 1,
    };
    setup(
      ["dictionary:word:read"],
      (c) =>
        c.path.startsWith("/api/dictionary/saved")
          ? { body: saved }
          : undefined,
      "/saved",
    );
    const card = await screen.findByRole("button", { name: "Open apple" });
    // the row shows one line of the card as plain text: no tags, no audio placeholders, nothing of a script
    expect(card.textContent).toContain("a fruit an apple a day");
    expect(card.textContent).not.toContain("<");
    expect(card.textContent).not.toContain("replace_audio");
    expect(card.textContent).not.toContain("hacked");
    expect(card.querySelector("script")).toBeNull();
    await user.click(card);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "apple" })).toBeTruthy();
    expect(within(dialog).getByText("a fruit")).toBeTruthy();
    expect(dialog.querySelector("ol li i")?.textContent).toBe("an apple a day"); // real list and italics, not tags as text
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the lookup when visiting another page, and clears the input with the X", async () => {
    const user = userEvent.setup();
    setup(["dictionary:word:read"], (c) => {
      if (c.path.startsWith("/api/dictionary/words/"))
        return { body: { word } };
      if (c.path.startsWith("/api/dictionary/saved"))
        return { body: { words: [], totalCount: 0, nextPageToken: "" } };
      return undefined;
    });
    await user.type(await screen.findByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText("used as a greeting");
    await user.click(screen.getByTestId("nav-saved"));
    await user.click(await screen.findByTestId("nav-lookup"));
    expect(
      ((await screen.findByLabelText("Words")) as HTMLTextAreaElement).value,
    ).toBe("hello");
    await user.click(screen.getByRole("button", { name: "Clear input" }));
    expect((screen.getByLabelText("Words") as HTMLTextAreaElement).value).toBe(
      "",
    );
  });

  it("looks up with Ctrl+Enter in the input", async () => {
    const calls = setup(["dictionary:word:read"], (c) =>
      c.path.startsWith("/api/dictionary/words/")
        ? { body: { word } }
        : undefined,
    );
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText("Words"),
      "hello{Control>}{Enter}{/Control}",
    );
    expect(await screen.findByText("used as a greeting")).toBeTruthy();
    expect(
      calls.some((c) => c.path.startsWith("/api/dictionary/words/hello")),
    ).toBe(true);
  });

  it("marks a word that is already saved and shows the notice inside its card, then removes it", async () => {
    const saved = {
      words: [
        {
          word: "Hello",
          content: "",
          audioUk: "",
          audioUs: "",
          createdAt: "2026-11-23T05:00:00Z",
        },
      ],
      nextPageToken: "",
      total: 1,
    };
    const calls = setup(["dictionary:word:*"], (c) => {
      if (c.method === "GET" && c.path.startsWith("/api/dictionary/saved"))
        return { body: saved };
      if (c.path.startsWith("/api/dictionary/words/"))
        return { body: { word } };
      if (c.method === "POST" && c.path === "/api/dictionary/saved")
        return { body: { savedCount: 1 } };
      return undefined;
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    const override = await screen.findByRole("button", {
      name: "Save override",
    });
    await user.click(override);
    const card = screen.getByTestId("word-hello");
    expect(
      await within(card).findByText('Overwrote "hello" (1/100).'),
    ).toBeTruthy();
    expect(
      calls.some(
        (c) => c.method === "POST" && c.path === "/api/dictionary/saved",
      ),
    ).toBe(true);
    await waitFor(
      () =>
        expect(
          within(card).queryByText('Overwrote "hello" (1/100).'),
        ).toBeNull(),
      { timeout: 6000 },
    );
  }, 12000);

  it("copies the input and the result as an Anki card", async () => {
    setup(["dictionary:word:read"], (c) =>
      c.path.startsWith("/api/dictionary/words/")
        ? { body: { word } }
        : undefined,
    );
    const user = userEvent.setup(); // installs its own clipboard
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.type(await screen.findByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Copy input" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("hello"));
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(await screen.findByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(
      await within(screen.getByTestId("word-hello")).findByText("Copied."),
    ).toBeTruthy();
    const text = (writeText.mock.calls[1] as unknown as [string])[0];
    expect(text.startsWith("hello\t")).toBe(true);
    expect(text).not.toContain("replace_audio");
  });
});

describe("saved words", () => {
  const list = {
    words: [
      {
        word: "hello",
        content: "<div/>",
        audioUk: "",
        audioUs: "",
        createdAt: "2026-11-23T05:00:00Z",
      },
    ],
    nextPageToken: "",
    total: 1,
  };

  it("lists, deletes after a confirmation and exports a deck", async () => {
    const click = vi.fn();
    const create = vi.fn(() => "blob:x");
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }),
    );
    const anchor = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(click);
    const calls = setup(["dictionary:word:*"], (c) => {
      if (c.path.startsWith("/api/dictionary/saved") && c.method === "GET")
        return { body: list };
      if (c.path === "/api/dictionary/export")
        return {
          body: { filename: "My Words.apkg", data: btoa("PK"), wordCount: 1 },
        };
      return undefined;
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("nav-saved"));
    expect(await screen.findByText("hello")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Export" }));
    await confirmExport(user);
    expect(
      await screen.findByText(/Exported 1 words to My Words.apkg/),
    ).toBeTruthy();
    expect(
      calls.find((c) => c.path === "/api/dictionary/export")?.body,
    ).toEqual({ group: "en", deckName: "My Words", scope: "EXPORT_SCOPE_NEW" });
    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    anchor.mockRestore();
    vi.unstubAllGlobals();
  });

  it("shows the next review of each word as a badge in the tone of its kind", async () => {
    const at = (seconds: number) =>
      new Date(Date.now() + seconds * 1000).toISOString();
    const day = 24 * 3600;
    const row = (word: string, extra: object = {}) => ({
      word,
      content: "<div/>",
      audioUk: "",
      audioUs: "",
      createdAt: "2026-11-23T05:00:00Z",
      ...extra,
    });
    const words = [
      row("fresh"),
      row("learn", { nextReviewAt: at(600), learning: true }),
      row("days", { nextReviewAt: at(3 * day + 3600) }),
      row("months", { nextReviewAt: at(60 * day) }),
      row("years", { nextReviewAt: at(400 * day) }),
      row("late", { nextReviewAt: at(-3600) }),
    ];
    setup(["dictionary:word:*"], (c) =>
      c.path.startsWith("/api/dictionary/saved") && c.method === "GET"
        ? { body: { words, nextPageToken: "", total: words.length } }
        : undefined,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("nav-saved"));
    await screen.findByText("fresh");
    const badge = (name: string, text: string) => {
      const el = screen.getAllByRole("img", { name })[0]!;
      expect(el.textContent).toBe(text);
      return el;
    };
    expect(badge("New", "New").className).toContain("text-primary");
    expect(badge("Learning: Review in 10m", "10m").className).toContain(
      "text-warning",
    );
    expect(badge("To review: Review in 3d", "3d").className).toContain(
      "text-success",
    );
    badge("To review: Review in 2mo", "2mo");
    badge("To review: Review in 1y", "1y");
    badge("To review: Review in Now", "Now");
  });

  it("exports the deck as a link an Anki app can import", async () => {
    const calls = setup(["dictionary:word:*"], (c) => {
      if (c.path.startsWith("/api/dictionary/saved") && c.method === "GET")
        return { body: list };
      if (c.path === "/api/dictionary/export-link") {
        return {
          body: {
            token: "tok123",
            filename: "My Words.apkg",
            wordCount: 1,
            expiresAt: "2030-01-01T10:15:00Z",
          },
        };
      }
      return undefined;
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("nav-saved"));
    await screen.findByText("hello");
    await user.click(screen.getByRole("button", { name: "Export" }));
    await confirmExport(user, "Get Anki link");
    const field = (await screen.findByLabelText(
      "Download link",
    )) as HTMLInputElement;
    expect(field.value).toBe(
      "https://api.example.com/api/dictionary/downloads/tok123.apkg",
    );
    expect(
      calls.find((c) => c.path === "/api/dictionary/export-link")?.body,
    ).toEqual({ group: "en", deckName: "My Words", scope: "EXPORT_SCOPE_NEW" });
    expect(
      await screen.findByText(/Exported 1 words to My Words.apkg/),
    ).toBeTruthy();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(field.value));
  });

  it("copies the link of a part at once, making it only the first time, and Download reuses it", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const calls = setup(["dictionary:word:*"], (c) => {
      if (c.path.startsWith("/api/dictionary/saved") && c.method === "GET")
        return { body: list };
      if (c.path.startsWith("/api/dictionary/exports/") && c.method === "GET")
        return {
          body: {
            job: {
              id: "j1",
              status: "done",
              deckName: "My Words",
              total: 4,
              built: 4,
              createdAt: "2030-01-01T00:00:00Z",
              expiresAt: "2030-01-02T00:00:00Z",
              parts: [
                { n: 1, wordCount: 2 },
                { n: 2, wordCount: 2 },
              ],
            },
          },
        };
      if (c.path === "/api/dictionary/exports/j1/parts/2/link")
        return {
          body: {
            token: "tok2",
            filename: "My Words (part 2).apkg",
            wordCount: 2,
            expiresAt: "2030-01-02T00:00:00Z",
          },
        };
      return undefined;
    });
    const linkCalls = () =>
      calls.filter((c) => c.path === "/api/dictionary/exports/j1/parts/2/link");
    const url =
      "https://api.example.com/api/dictionary/export-downloads/tok2.apkg";
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("nav-saved"));
    const buttons = await screen.findAllByRole("button", { name: "Copy link" });
    expect(buttons).toHaveLength(2);
    const writeText = vi.spyOn(navigator.clipboard, "writeText");

    await user.click(buttons[1]!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
    expect(linkCalls()).toHaveLength(1);
    // no field, no second button and no notice: the tick on the button is the answer
    expect(screen.queryByRole("textbox", { name: /Link of part/ })).toBeNull();
    expect(screen.queryByText(/Link copied/)).toBeNull();

    // the link is made once: asking again would replace the token
    await user.click(screen.getAllByRole("button", { name: "Copy link" })[1]!);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(linkCalls()).toHaveLength(1);

    await user.click(screen.getAllByRole("button", { name: "Download" })[1]!);
    await waitFor(() => expect(assign).toHaveBeenCalledWith(url));
    expect(linkCalls()).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("searches in the service after the user stops typing", async () => {
    const all = ["apple", "banana", "grape"].map((word) => ({
      word,
      content: "",
      audioUk: "",
      audioUs: "",
      createdAt: "2026-11-23T05:00:00Z",
    }));
    // the service filters; its totals ignore the query
    const calls = setup(["dictionary:word:read"], (c) => {
      if (!c.path.startsWith("/api/dictionary/saved")) return undefined;
      const q = new URLSearchParams(c.path.split("?")[1]).get("query") ?? "";
      const words = all.filter((w) => w.word.includes(q.toLowerCase()));
      return { body: { words, nextPageToken: "", total: 3, newTotal: 3 } };
    });
    const queries = () =>
      calls
        .filter((c) => c.path.startsWith("/api/dictionary/saved?"))
        .map((c) => new URLSearchParams(c.path.split("?")[1]).get("query"));
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("nav-saved"));
    expect(await screen.findByText("banana")).toBeTruthy();
    const box = screen.getByRole("textbox", { name: "Search saved words" });
    const before = queries().length;
    await user.type(box, "AP");
    // nothing is sent while the user types
    expect(queries().length).toBe(before);
    await waitFor(() => expect(screen.queryByText("banana")).toBeNull());
    expect(screen.getByText("apple")).toBeTruthy();
    expect(queries().slice(before)).toEqual(["AP"]);
    await user.clear(box);
    await waitFor(() => expect(screen.getByText("banana")).toBeTruthy());
    expect(queries().at(-1)).toBeNull();
    await user.type(box, "zzz");
    expect(
      await screen.findByText("No saved word matches your search or category."),
    ).toBeTruthy();
    // the list is not empty, only the search: the totals stay
    expect(screen.queryByText(/No saved words yet/)).toBeNull();
  });

  it("reads a long list one page at a time, the next page when asked", async () => {
    const row = (word: string) => ({ ...list.words[0], word });
    const calls = setup(["dictionary:word:*"], (c) => {
      if (c.method !== "GET" || !c.path.startsWith("/api/dictionary/saved?"))
        return undefined;
      return c.path.includes("pageToken=p2")
        ? {
            body: {
              ...list,
              words: [row("second")],
              nextPageToken: "",
              total: 2,
              newTotal: 2,
            },
          }
        : {
            body: {
              ...list,
              words: [row("first")],
              nextPageToken: "p2",
              total: 2,
              newTotal: 2,
            },
          };
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("nav-saved"));
    expect(await screen.findByText("first")).toBeTruthy();
    expect(screen.queryByText("second")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("second")).toBeTruthy();
    expect(screen.getByText("first")).toBeTruthy(); // the first page stays
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    const reads = calls
      .filter((c) => c.path.startsWith("/api/dictionary/saved?"))
      .map((c) => c.path);
    // two reads of one page of 50 each: the list is never read whole
    expect(reads.filter((p) => p.includes("pageSize=50")).length).toBe(2);
    expect(
      reads.some(
        (p) => p.includes("pageSize=50") && p.includes("pageToken=p2"),
      ),
    ).toBe(true);
  });

  it("deletes a word after the confirmation", async () => {
    const calls = setup(["dictionary:word:*"], (c) =>
      c.path.startsWith("/api/dictionary/saved") && c.method === "GET"
        ? { body: list }
        : undefined,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("nav-saved"));
    await user.click(
      await screen.findByRole("button", { name: "Delete hello" }),
    );
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText('Deleted "hello".')).toBeTruthy();
    expect(
      calls.some(
        (c) =>
          c.method === "DELETE" && c.path === "/api/dictionary/saved/hello?group=en",
      ),
    ).toBe(true);
  });
});

describe("dictionary settings", () => {
  const system = {
    maxSavedWords: 100,
    allowExportDeck: true,
    allowExportLink: true,
    dictionaries: { english: true, "english-vietnamese": true },
    removeAfterExport: true,
  };
  const user = {
    dictionaries: { english: true, "english-vietnamese": true },
    defaultDictionary: "english",
    deckName: "",
    maxLookupWords: 20,
    removeAfterExport: true,
    removeAcknowledged: true,
    freshDeck: false,
    reviewNewPerDay: 10,
    reviewMaxPerDay: 200,
    reviewAlgorithm: "sm2",
    desiredRetention: 90,
  };
  const withSettings =
    (
      mine: Record<string, unknown>,
      sys: Record<string, unknown>,
      rest: (c: Call) => { status?: number; body: unknown } | undefined = () =>
        undefined,
    ) =>
    (c: Call) =>
      c.path === "/api/dictionary/me/settings" && c.method === "GET"
        ? {
            body: { user: { ...user, ...mine }, system: { ...system, ...sys } },
          }
        : rest(c);
  const saved = {
    words: [
      {
        word: "hello",
        content: "<b>hi</b>",
        audioUk: "",
        audioUs: "",
        createdAt: "2026-11-23T05:00:00Z",
      },
    ],
    nextPageToken: "",
    total: 1,
  };

  it("hides the dictionary the administrator turned off", async () => {
    setup(
      ["dictionary:word:read"],
      withSettings(
        {},
        { dictionaries: { english: true, "english-vietnamese": false } },
      ),
    );
    await screen.findByLabelText("Words");
    await waitFor(() => expect(screen.queryByRole("tab")).toBeNull());
  });

  it("starts with the default dictionary of the user", async () => {
    const calls = setup(
      ["dictionary:word:read"],
      withSettings(
        { defaultDictionary: "english-vietnamese" },
        {},
        (c) =>
          c.path.startsWith("/api/dictionary/words/")
            ? { body: { word } }
            : undefined,
      ),
    );
    const u = userEvent.setup();
    const tab = await screen.findByRole("tab", {
      name: "English - Vietnamese",
    });
    await waitFor(() => expect(tab.getAttribute("aria-selected")).toBe("true"));
    await u.type(screen.getByLabelText("Words"), "hello");
    await u.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText("used as a greeting");
    expect(
      calls.some(
        (c) =>
          c.path ===
          "/api/dictionary/words/hello?dictionary=english-vietnamese",
      ),
    ).toBe(true);
  });

  it("limits the words of a lookup to the preference", async () => {
    const calls = setup(
      ["dictionary:word:read"],
      withSettings({ maxLookupWords: 2 }, {}),
    );
    const u = userEvent.setup();
    await screen.findByText(/up to 2/);
    await u.type(screen.getByLabelText("Words"), "a, b, c");
    await u.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText("At most 2 words at a time.")).toBeTruthy();
    expect(calls.some((c) => c.path === "/api/dictionary/lookup")).toBe(false);
  });

  it("highlights the saved words count in red once it is over the limit", async () => {
    setup(
      ["dictionary:word:*"],
      withSettings({}, { maxSavedWords: 1 }, (c) =>
        c.path.startsWith("/api/dictionary/saved") && c.method === "GET"
          ? {
              body: {
                ...saved,
                words: [...saved.words, { ...saved.words[0], word: "again" }],
                total: 2,
                newTotal: 2,
              },
            }
          : undefined,
      ),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    expect((await screen.findByText(/2 of 1 saved words/)).className).toContain(
      "text-destructive",
    );
    expect(
      document.querySelector('[role="progressbar"] > div')?.className,
    ).toContain("bg-destructive");
  });

  it("hides an export the administrator turned off and uses the default deck name and the limit", async () => {
    const calls = setup(
      ["dictionary:word:*"],
      withSettings(
        { deckName: "Mine" },
        { allowExportLink: false, maxSavedWords: 5 },
        (c) => {
          if (c.path.startsWith("/api/dictionary/saved") && c.method === "GET")
            return { body: saved };
          if (c.path === "/api/dictionary/export")
            return { body: { filename: "Mine.apkg", data: "", wordCount: 1 } };
          return undefined;
        },
      ),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    expect(await screen.findByText(/1 of 5 saved words/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Export" }));
    // the link is turned off: the dialog only offers the file
    expect(
      await screen.findByRole("button", { name: "Download file" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Get Anki link" })).toBeNull();
    // the dialog starts with the default deck name of the user
    expect(
      ((await screen.findByLabelText("Deck name")) as HTMLInputElement).value,
    ).toBe("Mine");
    await confirmExport(u);
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/export")?.body,
      ).toEqual({ group: "en", deckName: "Mine", scope: "EXPORT_SCOPE_NEW" }),
    );
  });

  it("hides every export when both are off", async () => {
    setup(
      ["dictionary:word:*"],
      withSettings(
        {},
        { allowExportDeck: false, allowExportLink: false },
        (c) =>
          c.path.startsWith("/api/dictionary/saved")
            ? { body: saved }
            : undefined,
      ),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    await screen.findByText("hello");
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  });

  it("explains a feature the service refuses", async () => {
    setup(
      ["dictionary:word:*"],
      withSettings({}, {}, (c) => {
        if (c.path.startsWith("/api/dictionary/saved") && c.method === "GET")
          return { body: saved };
        if (c.path === "/api/dictionary/export")
          return {
            status: 400,
            body: {
              error: {
                code: "bad_request",
                message: "FEATURE_DISABLED: this export is turned off",
              },
            },
          };
        return undefined;
      }),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    await screen.findByText("hello");
    await u.click(screen.getByRole("button", { name: "Export" }));
    await confirmExport(u);
    expect(
      await screen.findByText("An administrator turned this off."),
    ).toBeTruthy();
  });

  it("shows the Settings page with the dictionary the administrator turned off disabled, and saves the preferences", async () => {
    const calls = setup(
      ["dictionary:word:read"],
      withSettings(
        { maxLookupWords: 7 },
        { dictionaries: { english: true, "english-vietnamese": false } },
        (c) =>
          c.method === "PUT"
            ? {
                body: {
                  user: { ...user, deckName: "Mine", maxLookupWords: 5 },
                  system: {
                    ...system,
                    dictionaries: { english: true, "english-vietnamese": false },
                  },
                },
              }
            : undefined,
      ),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-settings"));
    const vi = await screen.findByRole("switch", {
      name: "English - Vietnamese",
    });
    expect((vi as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Turned off by an administrator.")).toBeTruthy();
    const max = screen.getByLabelText("Words per lookup");
    await waitFor(() => expect((max as HTMLInputElement).value).toBe("7"));
    await u.clear(max);
    await u.type(max, "5");
    await u.type(screen.getByLabelText("Default deck name"), "Mine");
    await u.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        user: {
          ...user,
          // the dictionary the administrator turned off is not the user's to switch
          dictionaries: { english: true },
          deckName: "Mine",
          maxLookupWords: 5,
        },
      }),
    );
    expect(await screen.findByText("Settings saved.")).toBeTruthy();
  });

  it("saves the choice of a new Anki deck on every export", async () => {
    const calls = setup(["dictionary:word:read"], withSettings({}, {}));
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-settings"));
    const sw = await screen.findByRole("switch", {
      name: "New deck on every export",
    });
    expect(sw.getAttribute("aria-checked")).toBe("false"); // off: importing again updates the cards
    await u.click(sw);
    await u.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        user: { ...user, freshDeck: true },
      }),
    );
  });

  it("keeps the default on a dictionary that is on and needs one dictionary", async () => {
    setup(["dictionary:word:read"], withSettings({}, {}));
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-settings"));
    await u.click(await screen.findByRole("switch", { name: "English" }));
    // English is off now, so the default moved to English - Vietnamese
    expect(
      screen
        .getByRole("radio", { name: "English - Vietnamese" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    await u.click(screen.getByRole("switch", { name: "English - Vietnamese" }));
    expect(screen.getByText("Keep at least one dictionary on.")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Save settings",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("saves every shown entry with Save all", async () => {
    const calls = setup(
      ["dictionary:word:*"],
      withSettings({}, {}, (c) => {
        if (c.path === "/api/dictionary/lookup")
          return {
            body: { words: [word, { ...word, text: "world" }], notFound: [] },
          };
        if (c.path.startsWith("/api/dictionary/words/"))
          return { body: { word } };
        if (c.method === "POST" && c.path === "/api/dictionary/saved")
          return { body: { savedCount: 1 } };
        return undefined;
      }),
    );
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Words"), "hello, world");
    await u.click(screen.getByRole("button", { name: "Look up" }));
    await u.click(await screen.findByRole("button", { name: "Save all" }));
    await waitFor(() =>
      expect(
        calls.filter(
          (c) => c.method === "POST" && c.path === "/api/dictionary/saved",
        ),
      ).toHaveLength(2),
    );
  });
});

describe("remove saved words after export", () => {
  const system = {
    maxSavedWords: 100,
    allowExportDeck: true,
    allowExportLink: true,
    dictionaries: { english: true, "english-vietnamese": true },
    removeAfterExport: true,
  };
  const user = {
    dictionaries: { english: true, "english-vietnamese": true },
    defaultDictionary: "english",
    deckName: "",
    maxLookupWords: 20,
    removeAfterExport: true,
    removeAcknowledged: true,
    freshDeck: false,
    reviewNewPerDay: 10,
    reviewMaxPerDay: 200,
    reviewAlgorithm: "sm2",
    desiredRetention: 90,
  };
  const row = (w: string, exported: boolean) => ({
    word: w,
    content: "<b>x</b>",
    audioUk: "",
    audioUs: "",
    createdAt: "2026-11-23T05:00:00Z",
    exported,
  });
  // one word exported and kept, one new
  const mixed = {
    words: [row("beta", false), row("alpha", true)],
    nextPageToken: "",
    total: 2,
    newTotal: 1,
  };
  const route =
    (
      mine: Record<string, unknown>,
      sys: Record<string, unknown>,
      list: unknown,
      rest: (c: Call) => { status?: number; body: unknown } | undefined = () =>
        undefined,
    ) =>
    (c: Call) => {
      if (c.path === "/api/dictionary/me/settings" && c.method === "GET")
        return {
          body: { user: { ...user, ...mine }, system: { ...system, ...sys } },
        };
      if (c.path === "/api/dictionary/me/settings" && c.method === "PUT") {
        return {
          body: {
            user: { ...user, ...mine, ...(c.body as { user: object }).user },
            system: { ...system, ...sys },
          },
        };
      }
      if (c.path.startsWith("/api/dictionary/saved?") && c.method === "GET")
        return { body: list };
      return rest(c);
    };

  it("flags the exported words and asks what to export", async () => {
    const calls = setup(
      ["dictionary:word:*"],
      route({ removeAfterExport: false }, {}, mixed, (c) =>
        c.path === "/api/dictionary/export"
          ? { body: { filename: "My Words.apkg", data: "", wordCount: 2 } }
          : undefined,
      ),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    await screen.findByText("beta");
    expect(screen.getAllByRole("img", { name: "Exported" })).toHaveLength(1);
    await u.click(screen.getByRole("button", { name: "Export" }));
    // the dialog asks what to pack because the list holds an exported word
    await u.click(
      await screen.findByRole("checkbox", {
        name: "Include words exported before (1)",
      }),
    );
    expect(await screen.findByText("2 words will be exported.")).toBeTruthy();
    await confirmExport(u);
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/export")?.body,
      ).toEqual({ group: "en", deckName: "My Words", scope: "EXPORT_SCOPE_ALL" }),
    );
    expect(await screen.findByText(/They stay in your list/)).toBeTruthy();
  });

  it("offers the exported words when the count of the new words stopped at its cap", async () => {
    // 10000 new words is a lower bound: how many were exported is not known, so the box has no number
    const capped = {
      ...mixed,
      total: 10000,
      newTotal: 10000,
      countsCapped: true,
    };
    const calls = setup(
      ["dictionary:word:*"],
      route({ removeAfterExport: false }, {}, capped, (c) =>
        c.path === "/api/dictionary/export"
          ? { body: { filename: "My Words.apkg", data: "", wordCount: 2 } }
          : undefined,
      ),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    await screen.findByText("beta");
    await u.click(screen.getByRole("button", { name: "Export" }));
    expect(
      await screen.findByText("10000+ words will be exported."),
    ).toBeTruthy();
    await u.click(
      await screen.findByRole("checkbox", {
        name: "Include words exported before",
      }),
    );
    expect(
      await screen.findByText("10000 words will be exported."),
    ).toBeTruthy(); // the whole list: exact
    await confirmExport(u);
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/export")?.body,
      ).toEqual({
        group: "en",
        deckName: "My Words",
        scope: "EXPORT_SCOPE_ALL",
      }),
    );
  });

  it("exports the new words only from the choice", async () => {
    const calls = setup(
      ["dictionary:word:*"],
      route({ removeAfterExport: false }, {}, mixed, (c) =>
        c.path === "/api/dictionary/export-link"
          ? {
              body: {
                token: "t".repeat(24),
                filename: "My Words.apkg",
                wordCount: 1,
                expiresAt: "2030-01-01T00:00:00Z",
              },
            }
          : undefined,
      ),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    await screen.findByText("beta");
    await u.click(screen.getByRole("button", { name: "Export" }));
    // the new words only are the default: the box of the exported ones stays off
    expect(
      (
        await screen.findByRole("checkbox", {
          name: "Include words exported before (1)",
        })
      ).getAttribute("aria-checked"),
    ).toBe("false");
    expect(await screen.findByText("1 word will be exported.")).toBeTruthy();
    await confirmExport(u, "Get Anki link");
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/export-link")?.body,
      ).toEqual({ group: "en", deckName: "My Words", scope: "EXPORT_SCOPE_NEW" }),
    );
  });

  it("disables 'new only' when nothing is new", async () => {
    const none = {
      words: [row("alpha", true)],
      nextPageToken: "",
      total: 1,
      newTotal: 0,
    };
    setup(["dictionary:word:*"], route({ removeAfterExport: false }, {}, none));
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    await screen.findByText("alpha");
    await u.click(screen.getByRole("button", { name: "Export" }));
    // nothing is new: the exported words are the only ones, so the box is on and cannot be turned off
    const box = await screen.findByRole("checkbox", {
      name: "Include words exported before (1)",
    });
    expect(box.hasAttribute("disabled")).toBe(true);
    expect(box.getAttribute("aria-checked")).toBe("true");
  });

  it("exports All words with scope new when no word was exported before", async () => {
    const fresh = {
      words: [row("beta", false)],
      nextPageToken: "",
      total: 1,
      newTotal: 1,
    };
    const calls = setup(
      ["dictionary:word:*"],
      route({}, {}, fresh, (c) =>
        c.path === "/api/dictionary/export"
          ? { body: { filename: "My Words.apkg", data: "", wordCount: 1 } }
          : undefined,
      ),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    await screen.findByText("beta");
    await u.click(screen.getByRole("button", { name: "Export" }));
    // nothing was exported before: no question about the scope, only the source (All words)
    expect(
      await screen.findByRole("radio", { name: "All words" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("checkbox", { name: /Include words exported before/ }),
    ).toBeNull();
    await confirmExport(u);
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/export")?.body,
      ).toEqual({ group: "en", deckName: "My Words", scope: "EXPORT_SCOPE_NEW" }),
    );
  });

  it("shows the switch in Settings, off and disabled when the administrator turned it off", async () => {
    setup(
      ["dictionary:word:read"],
      route({}, { removeAfterExport: false }, mixed),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-settings"));
    const sw = await screen.findByRole("switch", {
      name: "Remove saved words after export",
    });
    expect((sw as HTMLButtonElement).disabled).toBe(true);
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Turned off by an administrator.")).toBeTruthy();
  });

  it("saves the own choice from Settings", async () => {
    const calls = setup(["dictionary:word:read"], route({}, {}, mixed));
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-settings"));
    await u.click(
      await screen.findByRole("switch", {
        name: "Remove saved words after export",
      }),
    );
    await u.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        user: { ...user, removeAfterExport: false },
      }),
    );
  });

  it("asks to remove or keep the exported words, and removes them", async () => {
    const calls = setup(
      ["dictionary:word:*"],
      route({ removeAcknowledged: false }, {}, mixed, (c) =>
        c.path === "/api/dictionary/saved-words/remove-exported"
          ? { body: { removed: 1 } }
          : undefined,
      ),
    );
    const u = userEvent.setup();
    expect(await screen.findByText("Remove the exported words?")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Remove them" }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.path === "/api/dictionary/saved-words/remove-exported",
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        user: { ...user, removeAcknowledged: true },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Remove the exported words?")).toBeNull(),
    );
  });

  it("keeps the exported words when asked to, and remembers the answer", async () => {
    const calls = setup(
      ["dictionary:word:*"],
      route({ removeAcknowledged: false }, {}, mixed),
    );
    const u = userEvent.setup();
    await screen.findByText("Remove the exported words?");
    await u.click(screen.getByRole("button", { name: "Keep them" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        user: { ...user, removeAcknowledged: true },
      }),
    );
    expect(
      calls.some(
        (c) => c.path === "/api/dictionary/saved-words/remove-exported",
      ),
    ).toBe(false);
  });

  it("does not ask when no exported word is in the list, it only remembers", async () => {
    const fresh = {
      words: [row("beta", false)],
      nextPageToken: "",
      total: 1,
      newTotal: 1,
    };
    const calls = setup(
      ["dictionary:word:*"],
      route({ removeAcknowledged: false }, {}, fresh),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        user: { ...user, removeAcknowledged: true },
      }),
    );
    expect(screen.queryByText("Remove the exported words?")).toBeNull();
  });

  it("clears the answer when remove after export goes off", async () => {
    const calls = setup(
      ["dictionary:word:*"],
      route({ removeAcknowledged: true }, { removeAfterExport: false }, mixed),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        user: { ...user, removeAcknowledged: false },
      }),
    );
  });

  it("does not ask while remove after export is off", async () => {
    const calls = setup(
      ["dictionary:word:*"],
      route({ removeAcknowledged: false, removeAfterExport: false }, {}, mixed),
    );
    await screen.findByTestId("nav-saved");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Remove the exported words?")).toBeNull();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });
});

describe("card editing", () => {
  const ID = "0b8c2d5e-3f4a-4b6c-8d7e-1a2b3c4d5e6f";
  const saved = (content = "<div>old text</div>") => ({
    words: [
      {
        word: "apple",
        content,
        audioUk: "https://api.dictionaryapi.dev/uk.mp3",
        audioUs: "",
        createdAt: "2026-11-23T05:00:00Z",
      },
    ],
    nextPageToken: "",
    total: 1,
  });
  const route = (c: Call) => {
    if (c.method === "GET" && c.path.startsWith("/api/dictionary/saved"))
      return { body: saved() };
    if (c.path.startsWith("/api/dictionary/words/")) return { body: { word } };
    if (c.path === "/api/dictionary/images") return { body: { id: ID } };
    if (c.path === "/api/dictionary/saved") return { body: { savedCount: 1 } };
    return undefined;
  };

  async function editor() {
    const box = await screen.findByRole("textbox", { name: "Card editor" });
    return box as HTMLElement;
  }

  function pasteImage(box: HTMLElement) {
    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.paste(box, {
      clipboardData: { files: [file], getData: () => "", items: [] },
    });
  }

  it("edits a saved card in its dialog and saves it again", async () => {
    const calls = setup(
      ["dictionary:word:read", "dictionary:word:write"],
      route,
      "/saved",
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open apple" }));
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const box = await editor();
    expect(box.textContent).toContain("old text");
    await user.click(box);
    await user.keyboard(" more");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.method === "POST" && c.path === "/api/dictionary/saved",
        ),
      ).toBe(true),
    );
    const body = calls.find(
      (c) => c.method === "POST" && c.path === "/api/dictionary/saved",
    )!.body as Record<string, string>;
    expect(body.word).toBe("apple");
    expect(body.content).toContain("old text");
    expect(body.content).toContain("more");
    expect(body.content).not.toContain("\n");
    expect(body.audioUk).toBe("https://api.dictionaryapi.dev/uk.mp3");
    await waitFor(() => expect(screen.queryByTestId("card-editor")).toBeNull());
    expect(within(screen.getByRole("dialog")).getByText(/more/)).toBeTruthy();
  });

  it("has no Edit button without the write permission", async () => {
    setup(["dictionary:word:read"], route, "/saved");
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Open apple" }));
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("rejects an audio address that is not https", async () => {
    const calls = setup(
      ["dictionary:word:read", "dictionary:word:write"],
      route,
      "/saved",
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open apple" }));
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await editor();
    const input = screen.getByLabelText("US audio URL");
    await user.type(input, "http://x.example/a.mp3");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/must be an https URL/)).toBeTruthy();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  async function lookupHello(perms: string[]) {
    const calls = setup(perms, route);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText("used as a greeting");
    return { calls, user };
  }

  it("edits a card in place, shows the edit, saves it and reverts", async () => {
    const { calls, user } = await lookupHello([
      "dictionary:word:read",
      "dictionary:word:write",
    ]);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled(); // not while editing
    const box = await editor();
    await user.click(box);
    await user.keyboard("{Control>}a{/Control}my own words");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("my own words")).toBeTruthy();
    expect(
      calls.filter((c) => c.path.startsWith("/api/dictionary/words/")).length,
    ).toBe(1); // editing fetched nothing
    expect(screen.getByText("edited")).toBeTruthy();
    expect(screen.queryByText("used as a greeting")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.method === "POST" && c.path === "/api/dictionary/saved",
        ),
      ).toBe(true),
    );
    const body = calls.find(
      (c) => c.method === "POST" && c.path === "/api/dictionary/saved",
    )!.body as Record<string, string>;
    expect(body.content!.startsWith("<p>my own words</p><hr>")).toBe(true);
    // the other dictionary was fetched once, by the Save
    expect(
      calls.filter((c) => c.path.startsWith("/api/dictionary/words/")).length,
    ).toBe(2);
    await user.click(screen.getByRole("button", { name: "Revert" }));
    expect(await screen.findByText("used as a greeting")).toBeTruthy();
  });

  it("uploads a pasted image and inserts it as a dictimg reference", async () => {
    const { calls, user } = await lookupHello([
      "dictionary:word:read",
      "dictionary:word:write",
    ]);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const box = await editor();
    pasteImage(box);
    await waitFor(() => expect(box.querySelector("img")).not.toBeNull());
    expect(downscaleImage).toHaveBeenCalled();
    expect(
      calls.find((c) => c.path === "/api/dictionary/images")?.body,
    ).toEqual({ contentType: "image/webp", data: "AAAA" });
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.path === "/api/dictionary/saved" && c.method === "POST",
        ),
      ).toBe(true),
    );
    const body = calls.find(
      (c) => c.path === "/api/dictionary/saved" && c.method === "POST",
    )!.body as Record<string, string>;
    expect(body.content).toContain(`<img src="dictimg:${ID}">`);
  });

  it("resizes an image by dragging its corner handle, clamped, and saves the width", async () => {
    const { calls, user } = await lookupHello([
      "dictionary:word:read",
      "dictionary:word:write",
    ]);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const box = await editor();
    pasteImage(box);
    await waitFor(() =>
      expect(box.querySelector("img.card-image")).not.toBeNull(),
    );
    const img = box.querySelector("img.card-image")!;
    // the view is rebuilt after each drag, so the layout is faked on the prototypes
    let shown = 200;
    vi.spyOn(
      HTMLImageElement.prototype,
      "offsetWidth",
      "get",
    ).mockImplementation(() => shown);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
    await user.click(img);
    // jsdom has no PointerEvent: MouseEvent carries the coordinates
    if (!("PointerEvent" in window)) vi.stubGlobal("PointerEvent", MouseEvent);
    const drag = (dx: number) => {
      const handle = box.querySelector(".card-image-handle") as HTMLElement; // rebuilt after each drag
      fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientX: 100 + dx, pointerId: 1 });
      fireEvent.pointerUp(handle, { clientX: 100 + dx, pointerId: 1 });
    };
    drag(-1000);
    expect(box.querySelector("img.card-image")!.getAttribute("width")).toBe(
      "24",
    );
    drag(1000);
    expect(box.querySelector("img.card-image")!.getAttribute("width")).toBe(
      "500",
    );
    shown = 500;
    drag(-150);
    expect(box.querySelector("img.card-image")!.getAttribute("width")).toBe(
      "350",
    );
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.path === "/api/dictionary/saved" && c.method === "POST",
        ),
      ).toBe(true),
    );
    const body = calls.find(
      (c) => c.path === "/api/dictionary/saved" && c.method === "POST",
    )!.body as Record<string, string>;
    expect(body.content).toContain('width="350"');
  });

  it("shows the problem when the image cannot be uploaded", async () => {
    vi.mocked(downscaleImage).mockRejectedValueOnce(new ImageError("tooLarge"));
    const { user } = await lookupHello([
      "dictionary:word:read",
      "dictionary:word:write",
    ]);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    pasteImage(await editor());
    expect(
      await screen.findByText(/too large even after shrinking/),
    ).toBeTruthy();
  });

  it("reads a saved image once and shows it through a blob URL", async () => {
    clearImageCache();
    const create = vi.fn(() => "blob:img-1");
    URL.createObjectURL = create;
    const calls = setup(
      ["dictionary:word:read"],
      (c) => {
        if (c.path === `/api/dictionary/images/${ID}`)
          return { body: { contentType: "image/webp", data: "AAAA" } };
        if (c.method === "GET" && c.path.startsWith("/api/dictionary/saved"))
          return { body: saved(`<div>pic</div><img src="dictimg:${ID}">`) };
        return route(c);
      },
      "/saved",
    );
    const user = userEvent.setup();
    for (let i = 0; i < 2; i++) {
      await user.click(
        await screen.findByRole("button", { name: "Open apple" }),
      );
      const dialog = await screen.findByRole("dialog");
      await waitFor(() =>
        expect(dialog.querySelector("img")?.getAttribute("src")).toBe(
          "blob:img-1",
        ),
      );
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
    expect(
      calls.filter((c) => c.path === `/api/dictionary/images/${ID}`).length,
    ).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("audio files of a card", () => {
  const AID = "7d1f0c3a-5b2e-4c8d-9a6f-0e1d2c3b4a59";
  const REF = `dictaud:${AID}`;
  const W = ["dictionary:word:read", "dictionary:word:write"];
  const saved = (audioUs = "") => ({
    words: [
      {
        word: "apple",
        content: "<div>old text</div>",
        audioUk: "https://api.dictionaryapi.dev/uk.mp3",
        audioUs,
        createdAt: "2026-11-23T05:00:00Z",
      },
    ],
    nextPageToken: "",
    total: 1,
  });
  const route =
    (audioUs = "") =>
    (c: Call) => {
      if (c.method === "GET" && c.path.startsWith("/api/dictionary/saved"))
        return { body: saved(audioUs) };
      if (c.method === "POST" && c.path === "/api/dictionary/audio")
        return { body: { id: AID } };
      if (c.path === "/api/dictionary/saved")
        return { body: { savedCount: 1 } };
      return undefined;
    };
  const mp3 = (size = 3, name = "us.mp3") =>
    new File([new Uint8Array(size).fill(97)], name, { type: "audio/mpeg" });

  async function openEditor(
    r: (c: Call) => { status?: number; body: unknown } | undefined,
  ) {
    const calls = setup(W, r, "/saved");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open apple" }));
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByRole("textbox", { name: "Card editor" });
    return { calls, user };
  }
  const postedAudio = (calls: Call[]) =>
    calls.filter((c) => c.path === "/api/dictionary/audio");
  const savedBody = (calls: Call[]) =>
    calls.find(
      (c) => c.method === "POST" && c.path === "/api/dictionary/saved",
    )!.body as Record<string, string>;

  it("uploads a file, shows the chip and saves the reference", async () => {
    const { calls, user } = await openEditor(route());
    await user.upload(screen.getByLabelText("US audio file"), mp3());
    expect(await screen.findByTestId("audio-us-uploaded")).toHaveTextContent(
      "Uploaded audio",
    );
    expect(postedAudio(calls).map((c) => c.body)).toEqual([
      { contentType: "audio/mpeg", data: "YWFh" },
    ]);
    expect(screen.queryByLabelText("US audio URL")).toBeNull(); // the chip replaces the text box
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.method === "POST" && c.path === "/api/dictionary/saved",
        ),
      ).toBe(true),
    );
    const body = savedBody(calls);
    expect(body.audioUs).toBe(REF);
    expect(body.audioUk).toBe("https://api.dictionaryapi.dev/uk.mp3"); // a URL still works beside a file
  });

  it("does not check an uploaded file like an address, and keeps the reference of a saved card", async () => {
    const { calls, user } = await openEditor(route(REF));
    expect(await screen.findByTestId("audio-us-uploaded")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.method === "POST" && c.path === "/api/dictionary/saved",
        ),
      ).toBe(true),
    );
    expect(savedBody(calls).audioUs).toBe(REF);
    expect(vi.mocked(probeAudio).mock.calls.map((c) => c[0])).not.toContain(
      REF,
    );
  });

  it("removes the file and goes back to the text box", async () => {
    const { calls, user } = await openEditor(route(REF));
    await user.click(
      await screen.findByRole("button", { name: "Remove the US audio" }),
    );
    expect(screen.queryByTestId("audio-us-uploaded")).toBeNull();
    expect(screen.getByLabelText("US audio URL")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.method === "POST" && c.path === "/api/dictionary/saved",
        ),
      ).toBe(true),
    );
    expect(savedBody(calls).audioUs).toBe("");
  });

  it("turns Apply off while a file is being sent", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const calls = setup(W, route(), "/saved");
    // hold the answer of the upload: the fetch of the test helper answers at once, so gate the file read instead
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open apple" }));
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByRole("textbox", { name: "Card editor" });
    const slow = mp3();
    const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (this: FileReader, b: Blob) {
      void gate.then(() => read.call(this, b));
    };
    try {
      await user.upload(screen.getByLabelText("US audio file"), slow);
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      release();
      await screen.findByTestId("audio-us-uploaded");
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    } finally {
      FileReader.prototype.readAsDataURL = read;
    }
    expect(calls.length).toBeGreaterThan(0);
  });

  it("refuses a file that is too large or not audio without calling the service", async () => {
    const { calls, user } = await openEditor(route());
    const input = screen.getByLabelText("UK audio file");
    await user.upload(input, mp3(401 * 1024, "big.mp3"));
    expect(await screen.findByText(/audio file is too large/)).toBeTruthy();
    // the picker filters by accept; a drop or a renamed file can still bring another kind
    fireEvent.change(input, {
      target: { files: [new File(["x"], "pic.png", { type: "image/png" })] },
    });
    expect(await screen.findByText(/not a supported audio file/)).toBeTruthy();
    expect(postedAudio(calls)).toHaveLength(0);
    expect(screen.queryByTestId("audio-uk-uploaded")).toBeNull();
  });

  it.each([
    ["AUDIO_QUOTA_EXCEEDED", /used all your audio storage/],
    ["AUDIO_UNSUPPORTED", /not a supported audio file/],
    ["AUDIO_TOO_LARGE", /audio file is too large/],
    ["AUDIO_DISABLED", /Audio upload is not available/],
  ])("shows the answer %s of the service", async (code, text) => {
    const r = route();
    const { user } = await openEditor((c) =>
      c.method === "POST" && c.path === "/api/dictionary/audio"
        ? {
            status: 400,
            body: {
              error: { code: "invalid_argument", message: `${code}: nope` },
            },
          }
        : r(c),
    );
    await user.upload(screen.getByLabelText("US audio file"), mp3());
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByTestId("audio-us-uploaded")).toBeNull();
  });

  it("listens to an uploaded file through a blob URL read once", async () => {
    clearImageCache();
    const create = vi.fn(() => "blob:aud-1");
    URL.createObjectURL = create;
    const played: string[] = [];
    const OriginalAudio = globalThis.Audio;
    globalThis.Audio = class {
      constructor(readonly src: string) {}
      play() {
        played.push(this.src);
        return Promise.resolve();
      }
    } as unknown as typeof Audio;
    try {
      const { calls, user } = await openEditor((c) =>
        c.path === `/api/dictionary/audio/${AID}`
          ? { body: { contentType: "audio/mpeg", data: "YWFh" } }
          : route(REF)(c),
      );
      const listen = await screen.findByRole("button", {
        name: "Listen to the US audio",
      });
      await user.click(listen);
      await user.click(listen);
      await waitFor(() => expect(played).toEqual(["blob:aud-1", "blob:aud-1"]));
      expect(
        calls.filter((c) => c.path === `/api/dictionary/audio/${AID}`),
      ).toHaveLength(1);
      expect(create).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.Audio = OriginalAudio;
    }
  });
});

describe("card editing of both dictionaries and unsaved edits", () => {
  const W = ["dictionary:word:read", "dictionary:word:write"];
  const viWord = {
    ...word,
    audioUk: "",
    meanings: [
      { definition: "xin chào", examples: [], machineTranslated: false },
    ],
  };
  const lookupPath = (c: Call) => c.path.startsWith("/api/dictionary/words/");
  const make =
    (other: { status?: number; body: unknown } = { body: { word: viWord } }) =>
    (c: Call) => {
      if (lookupPath(c))
        return c.path.includes("english-vietnamese")
          ? other
          : { body: { word } };
      if (c.path === "/api/dictionary/saved" && c.method === "POST")
        return { body: { savedCount: 1 } };
      if (c.method === "GET" && c.path.startsWith("/api/dictionary/saved"))
        return { body: { words: [], nextPageToken: "", total: 0 } };
      return undefined;
    };
  async function lookup(
    route: (c: Call) => { status?: number; body: unknown } | undefined,
  ) {
    const calls = setup(W, route);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText("used as a greeting");
    return { calls, user };
  }
  const box = () => screen.findByRole("textbox", { name: "Card editor" });
  const saveBody = (calls: Call[]) =>
    calls.find((c) => c.method === "POST" && c.path === "/api/dictionary/saved")
      ?.body as Record<string, string> | undefined;

  const VI_TAB = { name: "English - Vietnamese" };
  const viLookups = (calls: Call[]) =>
    calls.filter(
      (c) => lookupPath(c) && c.path.includes("english-vietnamese"),
    );

  async function applyEdit(
    user: ReturnType<typeof userEvent.setup>,
    text = "mine",
  ) {
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const ed = await box();
    await user.click(ed);
    await user.keyboard(`{Control>}a{/Control}${text}`);
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText(text);
  }

  it("opens the editor with the shown dictionary only, without a request", async () => {
    const { calls, user } = await lookup(make());
    const before = calls.length;
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const ed = await box();
    expect(ed.textContent).toContain("used as a greeting");
    expect(ed.textContent).not.toContain("xin chào");
    expect(calls.length).toBe(before);
  });

  it("fetches the other dictionary on Save and joins it to the edit", async () => {
    const { calls, user } = await lookup(make());
    await applyEdit(user);
    expect(viLookups(calls)).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveBody(calls)).toBeTruthy());
    expect(viLookups(calls)).toHaveLength(1);
    const { content, audioUk } = saveBody(calls)!;
    expect(content).toContain("mine");
    expect(content).not.toContain("used as a greeting");
    expect(content!.indexOf("mine")).toBeLessThan(content!.indexOf("<hr>"));
    expect(content!.indexOf("<hr>")).toBeLessThan(content!.indexOf("xin chào"));
    expect(audioUk).toBe(word.audioUk);
  });

  it("saves the edits of both dictionaries without another request", async () => {
    const { calls, user } = await lookup(make());
    await applyEdit(user, "mineen");
    await user.click(screen.getByRole("tab", VI_TAB));
    await screen.findByText("xin chào");
    expect(viLookups(calls)).toHaveLength(1);
    await applyEdit(user, "minevi");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveBody(calls)).toBeTruthy());
    expect(viLookups(calls)).toHaveLength(1);
    const { content } = saveBody(calls)!;
    expect(content).toContain("mineen");
    expect(content).toContain("minevi");
    expect(content!.indexOf("mineen")).toBeLessThan(content!.indexOf("minevi"));
  });

  it("keeps the edit of a dictionary across tabs; Revert drops the edit of the shown one only", async () => {
    const { calls, user } = await lookup(make());
    await applyEdit(user, "mineen");
    await user.click(screen.getByRole("tab", VI_TAB));
    await screen.findByText("xin chào");
    await applyEdit(user, "minevi");
    await user.click(screen.getByRole("tab", { name: "English" }));
    expect(await screen.findByText("mineen")).toBeTruthy();
    const n = viLookups(calls).length;
    await user.click(screen.getByRole("tab", VI_TAB));
    expect(await screen.findByText("minevi")).toBeTruthy();
    expect(viLookups(calls)).toHaveLength(n);
    await user.click(screen.getByRole("button", { name: "Revert" }));
    expect(await screen.findByText("xin chào")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "English" }));
    expect(await screen.findByText("mineen")).toBeTruthy();
  });

  it("fetches again only the words without an edit in the new tab", async () => {
    const hi = { ...word, text: "hi" };
    const nw = { ...word, text: "new" };
    const calls = setup(W, (c) => {
      if (c.path === "/api/dictionary/lookup")
        return { body: { words: [hi, nw], notFound: [] } };
      if (lookupPath(c))
        return {
          body: {
            word: {
              ...(c.path.includes("/new") ? nw : hi),
              meanings: c.path.includes("VIETNAMESE")
                ? viWord.meanings
                : word.meanings,
            },
          },
        };
      if (c.method === "GET" && c.path.startsWith("/api/dictionary/saved"))
        return { body: { words: [], nextPageToken: "", total: 0 } };
      return undefined;
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hi, new");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByTestId("word-hi");
    await user.click(
      within(screen.getByTestId("word-hi")).getByRole("button", {
        name: "Edit",
      }),
    );
    await user.click(await box());
    await user.keyboard("{Control>}a{/Control}mine");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    const single = () => calls.filter(lookupPath).map((c) => c.path);
    const many = () =>
      calls
        .filter((c) => c.path === "/api/dictionary/lookup")
        .map((c) => (c.body as { dictionary: string }).dictionary);
    // no edit in this dictionary yet: both words are fetched
    await user.click(screen.getByRole("tab", VI_TAB));
    await waitFor(() =>
      expect(many()).toEqual(["english", "english-vietnamese"]),
    );
    await user.click(
      within(await screen.findByTestId("word-hi")).getByRole("button", {
        name: "Edit",
      }),
    );
    await user.click(await box());
    await user.keyboard("{Control>}a{/Control}minevi");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    // back: hi keeps its edit and is not fetched, new is
    await user.click(screen.getByRole("tab", { name: "English" }));
    await waitFor(() =>
      expect(single()).toEqual([
        "/api/dictionary/words/new?dictionary=english",
      ]),
    );
    expect(
      within(await screen.findByTestId("word-hi")).getByText("mine"),
    ).toBeTruthy();
    await user.click(screen.getByRole("tab", VI_TAB));
    await waitFor(() => expect(single()).toHaveLength(2));
    expect(single()[1]).toContain("/new?dictionary=english-vietnamese");
    expect(
      within(await screen.findByTestId("word-hi")).getByText("minevi"),
    ).toBeTruthy();
  });

  it.each([
    [
      "has no entry",
      { status: 404, body: { error: { code: "not_found", message: "x" } } },
    ],
    [
      "is off",
      {
        status: 403,
        body: {
          error: { code: "forbidden", message: "DICTIONARY_DISABLED: off" },
        },
      },
    ],
  ])("saves one dictionary when the other %s", async (_name, other) => {
    const { calls, user } = await lookup(make(other));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveBody(calls)).toBeTruthy());
    expect(saveBody(calls)!.content).toContain("used as a greeting");
    expect(saveBody(calls)!.content).not.toContain("<hr>");
  });

  it("shows a notice and saves nothing when the other dictionary fails on Save", async () => {
    const { calls, user } = await lookup(
      make({
        status: 500,
        body: { error: { code: "internal", message: "boom" } },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(saveBody(calls)).toBeUndefined();
  });

  it("applies the edit with Ctrl+Enter, without a line break", async () => {
    const { user } = await lookup(make());
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(await box());
    await user.keyboard(
      "{Control>}a{/Control}quick{Control>}{Enter}{/Control}",
    );
    expect(await screen.findByText("quick")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Card editor" })).toBeNull();
  });

  it("asks before a new lookup drops unsaved edits", async () => {
    const { user } = await lookup(make());
    await applyEdit(user);
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(
      await screen.findByText(
        "Looking up again will discard your unsaved edits.",
      ),
    ).toBeTruthy();
  });

  it("warns on leaving with unsaved edits; Stay keeps them, Leave goes", async () => {
    const { user } = await lookup(make());
    await applyEdit(user);
    await user.click(screen.getByTestId("nav-saved"));
    expect(
      await screen.findByText(
        "Your edits to the cards are not saved. Leaving this page will discard them.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Stay" }));
    expect(screen.getByText("mine")).toBeTruthy();
    await user.click(screen.getByTestId("nav-saved"));
    await user.click(await screen.findByRole("button", { name: "Leave" }));
    await waitFor(() => expect(screen.queryByLabelText("Words")).toBeNull());
    // back on Lookup the discarded edit is gone, and leaving again does not ask
    await user.click(screen.getByTestId("nav-lookup"));
    expect(await screen.findByText("used as a greeting")).toBeTruthy();
    expect(screen.queryByText("mine")).toBeNull();
    await user.click(screen.getByTestId("nav-saved"));
    await waitFor(() => expect(screen.queryByLabelText("Words")).toBeNull());
    expect(screen.queryByRole("button", { name: "Leave" })).toBeNull();
  });

  it("keeps the edited card when visiting another page and coming back", async () => {
    const { calls, user } = await lookup(make());
    await applyEdit(user);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveBody(calls)).toBeTruthy());
    await user.click(screen.getByTestId("nav-saved"));
    await waitFor(() => expect(screen.queryByLabelText("Words")).toBeNull());
    await user.click(screen.getByTestId("nav-lookup"));
    expect(await screen.findByText("mine")).toBeTruthy();
    expect(screen.queryByText("used as a greeting")).toBeNull();
  });

  it("does not warn after the edit is saved", async () => {
    const { calls, user } = await lookup(make());
    await applyEdit(user);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveBody(calls)).toBeTruthy());
    await screen.findByText(/Saved "hello"/);
    await user.click(screen.getByTestId("nav-saved"));
    await waitFor(() => expect(screen.queryByLabelText("Words")).toBeNull());
    expect(screen.queryByText("Unsaved edits")).toBeNull();
  });
});

describe("cards written by hand", () => {
  const WRITE = ["dictionary:word:read", "dictionary:word:write"];
  const notFound = {
    status: 404,
    body: { error: { code: "not_found", message: "x" } },
  };
  const down = {
    status: 503,
    body: { error: { code: "unavailable", message: "Service unavailable" } },
  };
  const make = (words: { status?: number; body: unknown }) => (c: Call) => {
    if (c.method === "GET" && c.path.startsWith("/api/dictionary/saved"))
      return {
        body: {
          words: [
            {
              word: "serendipity",
              content: "x",
              audioUk: "",
              audioUs: "",
              createdAt: "2026-11-23T05:00:00Z",
            },
          ],
          nextPageToken: "",
          total: 1,
        },
      };
    if (c.method === "POST" && c.path === "/api/dictionary/saved")
      return { body: { savedCount: 2 } };
    if (c.path.startsWith("/api/dictionary/words/")) return words;
    return undefined;
  };
  const post = (calls: Call[]) =>
    calls.find(
      (c) => c.method === "POST" && c.path === "/api/dictionary/saved",
    );

  async function typeInto(
    user: ReturnType<typeof userEvent.setup>,
    text: string,
  ) {
    const box = await screen.findByRole("textbox", { name: "Card editor" });
    await user.click(box);
    await user.keyboard(text);
  }

  it("creates a card by hand for a word that was not found and saves it", async () => {
    const calls = setup(WRITE, make(notFound));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "zzz");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText("No entry for: zzz")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Create card manually" }),
    );
    expect(screen.queryByText("No entry for: zzz")).toBeNull();
    await typeInto(user, "my own meaning");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(post(calls)).toBeTruthy());
    const body = post(calls)!.body as Record<string, string>;
    expect(body.word).toBe("zzz");
    expect(body.content).toContain("my own meaning");
    expect(screen.getByText("manual")).toBeTruthy();
  });

  it("refuses an empty card and drops it when cancelled", async () => {
    setup(WRITE, make(notFound));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "zzz");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(
      await screen.findByRole("button", { name: "Create card manually" }),
    );
    await screen.findByRole("textbox", { name: "Card editor" });
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText(/Write something first/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("word-zzz")).toBeNull();
    expect(screen.getByText("No entry for: zzz")).toBeTruthy();
  });

  it("offers a card per word when several are missing", async () => {
    setup(WRITE, (c) =>
      c.path === "/api/dictionary/lookup"
        ? { body: { words: [word], notFound: ["aaa", "bbb"] } }
        : undefined,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello, aaa, bbb");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(
      await screen.findByRole("button", { name: "Create card: bbb" }),
    );
    expect(await screen.findByTestId("word-bbb")).toBeTruthy();
    expect(screen.getByText("No entry for: aaa")).toBeTruthy();
  });

  it("offers to write the cards when the lookup fails, and saves without the dictionary", async () => {
    const calls = setup(WRITE, make(down));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText(/dictionary is unavailable/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Create card: hello" }),
    );
    await typeInto(user, "hi there");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(post(calls)).toBeTruthy());
    expect((post(calls)!.body as Record<string, string>).content).toContain(
      "hi there",
    );
  });

  it("creates a card for any word with New card, checking the word", async () => {
    const calls = setup(WRITE, make(notFound));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "New card" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Continue to editor" }),
    );
    expect(await within(dialog).findByText("Enter a word.")).toBeTruthy();
    await user.type(within(dialog).getByLabelText("Word"), "abc!");
    expect(within(dialog).getByRole("alert").textContent).toMatch(
      /letters, digits/,
    );
    await user.clear(within(dialog).getByLabelText("Word"));
    await user.type(within(dialog).getByLabelText("Word"), "serendipity");
    // the service is asked once the user stops typing
    expect(await within(dialog).findByText(/already saved/)).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: "Continue to editor" }),
    );
    await typeInto(user, "new text");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.click(
      await screen.findByRole("button", { name: "Save override" }),
    );
    await waitFor(() => expect(post(calls)).toBeTruthy());
    expect((post(calls)!.body as Record<string, string>).word).toBe(
      "serendipity",
    );
  });

  async function manualEditor() {
    const calls = setup(WRITE, make(notFound));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "zzz");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(
      await screen.findByRole("button", { name: "Create card manually" }),
    );
    await screen.findByRole("textbox", { name: "Card editor" });
    return { calls, user };
  }

  it("turns a pasted <source> tag of Cambridge into a full audio URL and saves it", async () => {
    const { calls, user } = await manualEditor();
    const tag =
      '<source type="audio/mpeg" src="/media/english/uk_pron/u/ukh/ukhef/ukheft_029.mp3">';
    await user.click(screen.getByLabelText("UK audio URL"));
    await user.paste(tag);
    const url =
      "https://dictionary.cambridge.org/media/english/uk_pron/u/ukh/ukhef/ukheft_029.mp3";
    expect(
      (screen.getByLabelText("UK audio URL") as HTMLInputElement).value,
    ).toBe(url);
    await user.click(screen.getByRole("textbox", { name: "Card editor" }));
    await user.keyboard("with sound");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(post(calls)).toBeTruthy());
    expect((post(calls)!.body as Record<string, string>).audioUk).toBe(url);
  });

  it("reports an audio file that does not load, and keeps it on a second Apply", async () => {
    const { calls, user } = await manualEditor();
    vi.mocked(probeAudio).mockResolvedValue(false);
    try {
      await user.type(
        screen.getByLabelText("US audio URL"),
        "https://dictionary.cambridge.org/media/english/us_pron/x/nope.mp3",
      );
      await user.click(screen.getByRole("textbox", { name: "Card editor" }));
      await user.keyboard("text");
      await user.click(screen.getByRole("button", { name: "Apply" }));
      expect(
        await screen.findByText(/US audio could not be loaded/),
      ).toBeTruthy();
      expect(screen.getByRole("textbox", { name: "Card editor" })).toBeTruthy(); // still editing
      await user.click(screen.getByRole("button", { name: "Apply" }));
      await user.click(await screen.findByRole("button", { name: "Save" }));
      await waitFor(() => expect(post(calls)).toBeTruthy());
      expect((post(calls)!.body as Record<string, string>).audioUs).toContain(
        "nope.mp3",
      );
    } finally {
      vi.mocked(probeAudio).mockResolvedValue(true);
    }
  });

  it("hides the buttons without the write permission", async () => {
    setup(["dictionary:word:read"], make(notFound));
    const user = userEvent.setup();
    expect(screen.queryByRole("button", { name: "New card" })).toBeNull();
    await user.type(await screen.findByLabelText("Words"), "zzz");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText("No entry for: zzz")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Create card manually" }),
    ).toBeNull();
  });
});

describe("saved words: audio buttons and the side panel limit", () => {
  const W = ["dictionary:word:read", "dictionary:word:write"];
  const mk = (n: number, extra: Record<string, string> = {}) => ({
    words: Array.from({ length: n }, (_, i) => ({
      word: `w${String(i).padStart(2, "0")}`,
      content: "<div>c</div>",
      audioUk: "",
      audioUs: "",
      createdAt: "2026-11-23T05:00:00Z",
      ...(i === 0 ? extra : {}),
    })),
    nextPageToken: "",
    total: n,
    newTotal: n,
  });

  it("plays the audio of a card from its tile and from its dialog", async () => {
    const played: string[] = [];
    const OriginalAudio = globalThis.Audio;
    globalThis.Audio = class {
      constructor(readonly src: string) {}
      play() {
        played.push(this.src);
        return Promise.resolve();
      }
    } as unknown as typeof Audio;
    try {
      setup(
        W,
        (c) =>
          c.method === "GET" && c.path.startsWith("/api/dictionary/saved")
            ? {
                body: mk(1, {
                  audioUk: "https://api.dictionaryapi.dev/uk.mp3",
                }),
              }
            : undefined,
        "/saved",
      );
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole("button", { name: "Play UK pronunciation" }),
      );
      expect(played).toEqual(["https://api.dictionaryapi.dev/uk.mp3"]);
      expect(screen.queryByRole("dialog")).toBeNull(); // the click did not open the card
      expect(
        screen.queryByRole("button", { name: "Play US pronunciation" }),
      ).toBeNull(); // no US audio, no button
      await user.click(screen.getByRole("button", { name: "Open w00" }));
      const dialog = await screen.findByRole("dialog");
      await user.click(
        within(dialog).getByRole("button", { name: "Play UK pronunciation" }),
      );
      expect(played).toHaveLength(2);
    } finally {
      globalThis.Audio = OriginalAudio;
    }
  });

  it("reads one small page for the panel of the lookup page and links to the page of all the words", async () => {
    const calls = setup(W, (c) => {
      if (!(c.method === "GET" && c.path.startsWith("/api/dictionary/saved")))
        return undefined;
      const size = Number(
        new URL(c.path, "https://x.example").searchParams.get("pageSize"),
      );
      const page = mk(12);
      return {
        body: {
          ...page,
          words: page.words.slice(0, size),
          nextPageToken: size < 12 ? "next" : "",
        },
      };
    });
    const link = await screen.findByRole("link", {
      name: /Showing the first 8 words/,
    });
    expect(link).toHaveAttribute("href", "/saved");
    expect(screen.getByRole("button", { name: "w07" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "w08" })).toBeNull();
    expect(calls.filter((c) => c.path.includes("pageSize=8"))).toHaveLength(1);
    expect(calls.some((c) => c.path.includes("pageToken"))).toBe(false); // it did not page through the rest for the panel
  });
});

describe("lookup errors", () => {
  it("shows no Try again for an empty input, but does for a lookup that failed", async () => {
    setup(["dictionary:word:read"], (c) =>
      c.path.startsWith("/api/dictionary/words/")
        ? {
            status: 503,
            body: { error: { code: "unavailable", message: "down" } },
          }
        : undefined,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Look up" }));
    expect(await screen.findByText("Type a word first.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await user.type(screen.getByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeTruthy();
  });
});

describe("review", () => {
  const learning = ["60", "600", "86400", "345600"];
  const card = (w: string, extra: Record<string, unknown> = {}) => ({
    word: w,
    group: "en",
    content: `<b>meaning of ${w}</b>`,
    audioUk: "",
    audioUs: "",
    isNew: true,
    learning: false,
    gradeIntervalsSeconds: learning,
    ...extra,
  });
  const queue = (
    cards: ReturnType<typeof card>[],
    extra: Record<string, unknown> = {},
  ) => ({
    cards,
    dueCount: 0,
    learningCount: 0,
    newCount: cards.length,
    totalCount: cards.length,
    ...extra,
  });
  const read = ["dictionary:word:read"];
  const reviewRoute =
    (
      q: unknown,
      post: (c: Call) => { status?: number; body: unknown } = () => ({
        body: { dueAt: "2026-11-26T00:00:00Z", intervalSeconds: "86400" },
      }),
    ) =>
    (c: Call) => {
      if (c.path.startsWith("/api/dictionary/review") && c.method === "GET")
        return { body: q };
      if (c.path === "/api/dictionary/review" && c.method === "POST")
        return post(c);
      return undefined;
    };
  const posts = (calls: Call[]) =>
    calls.filter(
      (c) => c.method === "POST" && c.path === "/api/dictionary/review",
    );

  it("is a menu item for the readers only", async () => {
    setup(read, reviewRoute(queue([])));
    expect(await screen.findByTestId("nav-review")).toBeTruthy();
  });

  it("shows the new, learning and review cards apart", async () => {
    setup(
      read,
      reviewRoute(
        queue([card("a"), card("b")], {
          dueCount: 3,
          learningCount: 1,
          newCount: 2,
          totalCount: 9,
        }),
      ),
      "/review",
    );
    expect((await screen.findByTestId("review-review")).textContent).toBe("3");
    expect(screen.getByTestId("review-learning").textContent).toBe("1");
    expect(screen.getByTestId("review-new").textContent).toBe("2");
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
  });

  it("flips with a click and with Space, and grades with the key 3", async () => {
    const calls = setup(
      read,
      reviewRoute(queue([card("alpha"), card("beta")])),
      "/review",
    );
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Start" }));
    expect((await screen.findByTestId("review-word")).textContent).toBe(
      "alpha",
    );
    expect(screen.queryByTestId("review-back")).toBeNull();
    await u.click(screen.getByRole("button", { name: "Show answer" }));
    expect(screen.getByText("meaning of alpha")).toBeTruthy();
    // the labels carry the next interval
    expect(screen.getByRole("button", { name: /Easy\s*4d/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Again\s*1m/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Hard\s*10m/ })).toBeTruthy();

    await u.keyboard("3");
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0]?.body).toEqual({
      group: "en",
      word: "alpha",
      grade: "REVIEW_GRADE_GOOD",
    });

    // next card: Space flips it
    await waitFor(() =>
      expect(screen.getByTestId("review-word").textContent).toBe("beta"),
    );
    expect(screen.queryByTestId("review-back")).toBeNull();
    await u.keyboard(" ");
    expect(await screen.findByTestId("review-back")).toBeTruthy();
    // 1 to 4 do nothing before the card is flipped
  });

  it("ignores the keys before the answer is shown and while typing", async () => {
    const calls = setup(read, reviewRoute(queue([card("alpha")])), "/review");
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Start" }));
    await screen.findByTestId("review-word");
    await u.keyboard("3");
    expect(posts(calls)).toHaveLength(0);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    await u.keyboard(" ");
    expect(screen.queryByTestId("review-back")).toBeNull();
    input.remove();
  });

  it("puts a card graded Again at the end of the queue, then finishes the session", async () => {
    const calls = setup(
      read,
      reviewRoute(queue([card("alpha"), card("beta")]), (c) => {
        const again =
          (c.body as { grade: string }).grade === "REVIEW_GRADE_AGAIN";
        return {
          body: again
            ? { dueAt: "2026-11-25T00:01:00Z", intervalSeconds: "60" }
            : { dueAt: "2026-11-26T00:00:00Z", intervalSeconds: "86400" },
        };
      }),
      "/review",
    );
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Start" }));
    expect(screen.getByTestId("session-new").textContent).toBe("2");
    expect(screen.getByTestId("session-learning").textContent).toBe("0");
    await u.keyboard(" ");
    await u.keyboard("1"); // alpha: Again
    await waitFor(() =>
      expect(screen.getByTestId("review-word").textContent).toBe("beta"),
    );
    expect(screen.getByText("0 / 2")).toBeTruthy();
    // alpha moved from new to learning
    expect(screen.getByTestId("session-new").textContent).toBe("1");
    expect(screen.getByTestId("session-learning").textContent).toBe("1");
    await u.keyboard(" ");
    await u.keyboard("3"); // beta: Good
    await waitFor(() =>
      expect(screen.getByTestId("review-word").textContent).toBe("alpha"),
    );
    expect(screen.getByText("1 / 2")).toBeTruthy();
    await u.keyboard(" ");
    await u.keyboard("4"); // alpha: Easy
    const done = await screen.findByTestId("review-done");
    expect(done.textContent).toContain("2 cards");
    expect(done.textContent).toContain("Again 1 time");
    expect(
      posts(calls).map((c) => (c.body as { grade: string }).grade),
    ).toEqual(["REVIEW_GRADE_AGAIN", "REVIEW_GRADE_GOOD", "REVIEW_GRADE_EASY"]);
  });

  it("tells when the next card comes due after the last one", async () => {
    const next = new Date(Date.now() + 3 * 3600 * 1000 + 60_000).toISOString();
    setup(
      read,
      reviewRoute(queue([], { totalCount: 4, nextDueAt: next })),
      "/review",
    );
    expect((await screen.findByTestId("review-next")).textContent).toBe(
      "Come back in 3h.",
    );
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  });

  it("explains that there is nothing to review without saved words and links to the lookup", async () => {
    setup(read, reviewRoute(queue([], { totalCount: 0 })), "/review");
    const link = await screen.findByRole("link", { name: "Go to Lookup" });
    expect(link.getAttribute("href")).toBe("/");
  });

  it("keeps the card when the grade cannot be sent and sends it again", async () => {
    let fail = true;
    const calls = setup(
      read,
      reviewRoute(queue([card("alpha")]), () => {
        if (fail)
          return {
            status: 503,
            body: { error: { code: "unavailable", message: "down" } },
          };
        return {
          body: { dueAt: "2026-11-26T00:00:00Z", intervalSeconds: "86400" },
        };
      }),
      "/review",
    );
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Start" }));
    await u.keyboard(" ");
    await u.keyboard("3");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("review-word").textContent).toBe("alpha");
    const good = screen.getByRole("button", {
      name: /Good/,
    }) as HTMLButtonElement;
    expect(good.disabled).toBe(false);
    fail = false;
    await u.click(good);
    expect(await screen.findByTestId("review-done")).toBeTruthy();
    expect(posts(calls)).toHaveLength(2);
  });

  it("saves the number of new words per day in the settings", async () => {
    const user = {
      dictionaries: { english: true, "english-vietnamese": true },
      defaultDictionary: "english",
      removeAfterExport: true,
      removeAcknowledged: true,
      maxLookupWords: 20,
      reviewNewPerDay: 5,
    };
    const system = {
      maxSavedWords: 100,
      allowExportDeck: true,
      allowExportLink: true,
      dictionaries: { english: true, "english-vietnamese": true },
      removeAfterExport: true,
    };
    const calls = setup(
      read,
      (c) =>
        c.path === "/api/dictionary/me/settings" && c.method === "GET"
          ? { body: { user, system } }
          : undefined,
      "/settings",
    );
    const u = userEvent.setup();
    const field = (await screen.findByLabelText(
      "New words per day",
    )) as HTMLInputElement;
    expect(field.value).toBe("5");
    await u.clear(field);
    await u.type(field, "0");
    await u.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() =>
      expect(
        (
          calls.find((c) => c.method === "PUT")?.body as {
            user: { reviewNewPerDay: number };
          }
        ).user.reviewNewPerDay,
      ).toBe(0),
    );
    await u.clear(field);
    await u.type(field, "101");
    expect(
      (
        screen.getByRole("button", {
          name: "Save settings",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("saves the number of review cards per day in the settings", async () => {
    const user = {
      dictionaries: { english: true, "english-vietnamese": true },
      defaultDictionary: "english",
      removeAfterExport: true,
      removeAcknowledged: true,
      maxLookupWords: 20,
      reviewNewPerDay: 5,
      reviewMaxPerDay: 300,
    };
    const system = {
      maxSavedWords: 100,
      allowExportDeck: true,
      allowExportLink: true,
      dictionaries: { english: true, "english-vietnamese": true },
      removeAfterExport: true,
    };
    const calls = setup(
      read,
      (c) =>
        c.path === "/api/dictionary/me/settings" && c.method === "GET"
          ? { body: { user, system } }
          : undefined,
      "/settings",
    );
    const u = userEvent.setup();
    const field = (await screen.findByLabelText(
      "Reviews per day",
    )) as HTMLInputElement;
    expect(field.value).toBe("300");
    await u.clear(field);
    await u.type(field, "0");
    await u.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => {
      const sent = (
        calls.find((c) => c.method === "PUT")?.body as {
          user: { reviewMaxPerDay: number; reviewNewPerDay: number };
        }
      ).user;
      expect(sent.reviewMaxPerDay).toBe(0);
      expect(sent.reviewNewPerDay).toBe(5);
    });
    await u.clear(field);
    await u.type(field, "10000");
    expect(
      (
        screen.getByRole("button", {
          name: "Save settings",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await u.clear(field);
    expect(
      (
        screen.getByRole("button", {
          name: "Save settings",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

/** Opens a dropdown (by its label) and picks the option whose value is `value`: the ids below map to their names. */
async function pick(
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
  id: string,
) {
  const names: Record<string, string> = {
    c1: "Travel",
    c2: "Food",
    none: "Uncategorized",
  };
  await user.click(trigger);
  const list = await screen.findByRole("listbox");
  await user.click(
    within(list).getByRole("option", { name: new RegExp(`^${names[id]}`) }),
  );
}

describe("categories", () => {
  const cats = {
    categories: [
      { id: "c1", name: "Travel", total: 1, newTotal: 1 },
      { id: "c2", name: "Food", total: 1, newTotal: 1 },
    ],
    uncategorizedTotal: 1,
    uncategorizedNewTotal: 1,
  };
  const row = (w: string, ids?: string[]) => ({
    word: w,
    content: "<div/>",
    audioUk: "",
    audioUs: "",
    createdAt: "2026-11-23T05:00:00Z",
    ...(ids ? { categoryIds: ids } : {}),
  });
  const saved = {
    words: [row("hello", ["c1"]), row("world")],
    nextPageToken: "",
    total: 2,
    newTotal: 2,
  };
  const ok = (body: unknown) => ({ body });
  // the GET routes of the saved list and the categories; the others are the test's own
  const route =
    (
      rest: (c: Call) => { status?: number; body: unknown } | undefined = () =>
        undefined,
    ) =>
    (c: Call) => {
      if (c.path === "/api/dictionary/categories?group=en" && c.method === "GET")
        return ok(cats);
      if (c.path.startsWith("/api/dictionary/saved?") && c.method === "GET")
        return ok(saved);
      return rest(c);
    };
  const goSaved = async (calls: () => void = () => undefined) => {
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    await screen.findByText("hello");
    calls();
    return u;
  };

  it("limits the length of a category name to the setting of the administrator", async () => {
    setup(
      ["dictionary:word:*"],
      route((c) =>
        c.path === "/api/dictionary/me/settings" && c.method === "GET"
          ? {
              body: {
                user: {
                  dictionaries: { english: true, "english-vietnamese": true },
                  defaultDictionary: "english",
                  maxLookupWords: 20,
                },
                system: {
                  maxSavedWords: 100,
                  allowExportDeck: true,
                  allowExportLink: true,
                  dictionaries: { english: true, "english-vietnamese": true },
                  removeAfterExport: true,
                  maxCategories: 3,
                  maxCategoryNameLength: 10,
                },
              },
            }
          : undefined,
      ),
    );
    const u = await goSaved();
    await u.click(screen.getByRole("button", { name: "Manage categories" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(
        (within(dialog).getByLabelText("New category name") as HTMLInputElement)
          .maxLength,
      ).toBe(10),
    );
    await u.click(
      within(dialog).getByRole("button", { name: "Rename Travel" }),
    );
    expect(
      (within(dialog).getByLabelText("Name of Travel") as HTMLInputElement)
        .maxLength,
    ).toBe(10);
  });

  it("filters the saved words by category and remembers the choice", async () => {
    const calls = setup(["dictionary:word:*"], route());
    const u = await goSaved();
    // the chip of the word shows its category, the pill filters by it
    expect(screen.getAllByText("Travel")).toHaveLength(2);
    await u.click(screen.getByRole("button", { name: /^Travel/ }));
    await waitFor(() =>
      expect(calls.some((c) => c.path.includes("categoryId=c1"))).toBe(true),
    );
    expect(window.localStorage.getItem("dict:category:saved")).toBe("c1");
    await u.click(screen.getByRole("button", { name: /^Uncategorized/ }));
    await waitFor(() =>
      expect(
        calls.some((c) => c.path.includes("categoryId=uncategorized")),
      ).toBe(true),
    );
  });

  it("keeps the selected words when the search shows other words", async () => {
    const calls = setup(["dictionary:word:*"], (c) => {
      if (c.path === "/api/dictionary/categories?group=en") return ok(cats);
      if (c.path.startsWith("/api/dictionary/saved?") && c.method === "GET") {
        const q = new URLSearchParams(c.path.split("?")[1]).get("query") ?? "";
        return ok({
          ...saved,
          words: saved.words.filter((w) => w.word.includes(q)),
        });
      }
      if (c.path === "/api/dictionary/export")
        return ok({ filename: "My Words.apkg", data: "", wordCount: 2 });
      return undefined;
    });
    const u = await goSaved();
    await u.click(screen.getByRole("checkbox", { name: "Select hello" }));
    await u.type(
      screen.getByRole("textbox", { name: "Search saved words" }),
      "wor",
    );
    await waitFor(() => expect(screen.queryByText("hello")).toBeNull());
    await u.click(screen.getByRole("checkbox", { name: "Select world" }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: /^Export selected/ }));
    await confirmExport(u);
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/export")?.body,
      ).toEqual({ group: "en", deckName: "My Words", words: ["hello", "world"] }),
    );
  });

  it("adds the selected words to a category in one call", async () => {
    const calls = setup(
      ["dictionary:word:*"],
      route((c) =>
        c.path === "/api/dictionary/saved-words/categories"
          ? ok({ updated: 2 })
          : undefined,
      ),
    );
    const u = await goSaved();
    await u.click(screen.getByRole("checkbox", { name: "Select hello" }));
    await u.click(screen.getByRole("checkbox", { name: "Select world" }));
    await u.click(screen.getByRole("button", { name: "Categories" }));
    const menu = await screen.findByRole("group", { name: "Categories" });
    // hello is in Travel, world in nothing: Travel is a partial state and Food is empty
    await u.click(within(menu).getByRole("checkbox", { name: "Food" }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/saved-words/categories")
          ?.body,
      ).toEqual({
        group: "en",
        words: ["hello", "world"],
        addCategoryIds: ["c2"],
        removeCategoryIds: [],
      }),
    );
    // with only hello ticked, Travel is on for all of them: the same click takes it out
    await u.click(screen.getByRole("button", { name: "Clear selection" }));
    await u.click(screen.getByRole("checkbox", { name: "Select hello" }));
    await u.click(screen.getByRole("button", { name: "Categories" }));
    await u.click(
      within(
        await screen.findByRole("group", { name: "Categories" }),
      ).getByRole("checkbox", { name: "Travel" }),
    );
    await waitFor(() =>
      expect(
        calls.filter(
          (c) => c.path === "/api/dictionary/saved-words/categories",
        )[1]?.body,
      ).toEqual({
        group: "en",
        words: ["hello"],
        addCategoryIds: [],
        removeCategoryIds: ["c1"],
      }),
    );
  });

  it("exports the words of a category", async () => {
    const calls = setup(
      ["dictionary:word:*"],
      route((c) =>
        c.path === "/api/dictionary/export"
          ? ok({ filename: "Food.apkg", data: "", wordCount: 1 })
          : undefined,
      ),
    );
    const u = await goSaved();
    await u.click(screen.getByRole("button", { name: "Export" }));
    await u.click(await screen.findByRole("radio", { name: "Category" }));
    await pick(u, screen.getByLabelText("Category to export"), "c2");
    // the deck is named after the category
    expect((screen.getByLabelText("Deck name") as HTMLInputElement).value).toBe(
      "Food",
    );
    await confirmExport(u);
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/export")?.body,
      ).toEqual({
        group: "en",
        deckName: "Food",
        scope: "EXPORT_SCOPE_NEW",
        categoryId: "c2",
      }),
    );
  });

  it("exports exactly the selected words, and offers them only when rows are selected", async () => {
    const calls = setup(
      ["dictionary:word:*"],
      route((c) =>
        c.path === "/api/dictionary/export-link"
          ? ok({
              token: "t".repeat(24),
              filename: "My Words.apkg",
              wordCount: 1,
              expiresAt: "2030-01-01T00:00:00Z",
            })
          : undefined,
      ),
    );
    const u = await goSaved();
    await u.click(screen.getByRole("button", { name: "Export" }));
    expect(
      (
        await screen.findByRole("radio", { name: "Selected words (0)" })
      ).hasAttribute("disabled"),
    ).toBe(true);
    await u.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await u.click(screen.getByRole("checkbox", { name: "Select world" }));
    // the export button starts on the selected words
    await u.click(screen.getByRole("button", { name: "Export" }));
    const selected = (await screen.findByRole("radio", {
      name: "Selected words (1)",
    })) as HTMLInputElement;
    expect(selected.checked).toBe(true);
    await confirmExport(u, "Get Anki link");
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/export-link")?.body,
      ).toEqual({ group: "en", deckName: "My Words", words: ["world"] }),
    );
  });

  it("has an Export selected button in the selection bar", async () => {
    const calls = setup(
      ["dictionary:word:*"],
      route((c) =>
        c.path === "/api/dictionary/export"
          ? ok({ filename: "My Words.apkg", data: "", wordCount: 1 })
          : undefined,
      ),
    );
    const u = await goSaved();
    await u.click(screen.getByRole("checkbox", { name: "Select hello" }));
    await u.click(screen.getByRole("button", { name: /^Export selected/ }));
    await confirmExport(u);
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/export")?.body,
      ).toEqual({ group: "en", deckName: "My Words", words: ["hello"] }),
    );
  });

  it("creates, renames and deletes categories in the manager", async () => {
    const calls = setup(
      ["dictionary:word:*"],
      route((c) => {
        if (c.path === "/api/dictionary/categories" && c.method === "POST")
          return ok({ category: { id: "c3", name: "Work" } });
        if (c.path === "/api/dictionary/categories/c1" && c.method === "PATCH")
          return ok({ category: { id: "c1", name: "Trips" } });
        return undefined;
      }),
    );
    const u = await goSaved();
    await u.click(screen.getByRole("button", { name: "Manage categories" }));
    const dialog = await screen.findByRole("dialog");
    await u.type(within(dialog).getByLabelText("New category name"), "Work");
    await u.click(
      within(dialog).getByRole("button", { name: "Create category" }),
    );
    await waitFor(() =>
      expect(
        calls.find(
          (c) => c.path === "/api/dictionary/categories" && c.method === "POST",
        )?.body,
      ).toEqual({ name: "Work" }),
    );
    await u.click(
      within(dialog).getByRole("button", { name: "Rename Travel" }),
    );
    const input = within(dialog).getByLabelText("Name of Travel");
    await u.clear(input);
    await u.type(input, "Trips{Enter}");
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
        name: "Trips",
      }),
    );
    await u.click(within(dialog).getByRole("button", { name: "Delete Food" }));
    await u.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.method === "DELETE" && c.path === "/api/dictionary/categories/c2",
        ),
      ).toBe(true),
    );
  });

  it("changes the categories of a word in its editor without saving it as new", async () => {
    const calls = setup(
      ["dictionary:word:*"],
      route((c) =>
        c.method === "POST" &&
        (c.path === "/api/dictionary/saved" ||
          c.path === "/api/dictionary/saved-words/categories")
          ? ok({ savedCount: 2, updated: 1 })
          : undefined,
      ),
    );
    const u = await goSaved();
    await u.click(screen.getByRole("button", { name: "Open hello" }));
    await u.click(await screen.findByRole("button", { name: "Edit" }));
    const group = await screen.findByRole("group", {
      name: "Categories of this word",
    });
    expect(
      within(group)
        .getByRole("button", { name: "Travel" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    await u.click(within(group).getByRole("button", { name: "Travel" }));
    await u.click(within(group).getByRole("button", { name: "Food" }));
    await u.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/saved-words/categories")
          ?.body,
      ).toEqual({
        group: "en",
        words: ["hello"],
        addCategoryIds: ["c2"],
        removeCategoryIds: ["c1"],
      }),
    );
    // the card is saved by SaveWord, which gets no categories (they only add and are not the edit's job)
    expect(
      (
        calls.find(
          (c) => c.method === "POST" && c.path === "/api/dictionary/saved",
        )?.body as { categoryIds?: string[] }
      ).categoryIds,
    ).toBeUndefined();
  });

  // the lookup of "hello, world" with a saved list that holds `have`
  const lookupPair = async (
    have: ReturnType<typeof row>[],
    rest: (c: Call) => { status?: number; body: unknown } | undefined = () =>
      undefined,
  ) => {
    const calls = setup(["dictionary:word:*"], (c) => {
      const own = rest(c);
      if (own) return own;
      if (c.path === "/api/dictionary/categories?group=en" && c.method === "GET")
        return ok(cats);
      if (c.path.startsWith("/api/dictionary/saved?") && c.method === "GET")
        return ok({
          words: have,
          nextPageToken: "",
          total: have.length,
          newTotal: have.length,
        });
      if (c.path === "/api/dictionary/lookup")
        return ok({ words: [word, { ...word, text: "world" }], notFound: [] });
      if (c.method === "POST" && c.path === "/api/dictionary/saved")
        return ok({ savedCount: 1 });
      return undefined;
    });
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Words"), "hello, world");
    await u.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByTestId("word-hello");
    return { calls, u };
  };
  const pickIn = async (
    u: ReturnType<typeof userEvent.setup>,
    w: string,
    cat: string,
  ) => {
    await u.click(
      within(screen.getByTestId(`word-${w}`)).getByRole("button", {
        name: /^Categories/,
      }),
    );
    await u.click(
      within(
        await screen.findByRole("group", { name: "Categories" }),
      ).getByRole("checkbox", { name: cat }),
    );
    await u.keyboard("{Escape}");
  };
  const savedBodies = (calls: Call[]) =>
    calls
      .filter((c) => c.method === "POST" && c.path === "/api/dictionary/saved")
      .map((c) => c.body as { word: string; categoryIds?: string[] });

  it("saves a word from the lookup with the categories picked in its own card, and remembers them", async () => {
    const { calls, u } = await lookupPair([]);
    await pickIn(u, "hello", "Food");
    await u.click(
      within(screen.getByTestId("word-hello")).getByRole("button", {
        name: /^Save/,
      }),
    );
    await waitFor(() => expect(savedBodies(calls)).toHaveLength(1));
    expect(savedBodies(calls)[0]).toMatchObject({
      word: "hello",
      categoryIds: ["c2"],
    });
    // a pick is not a default until the user says so
    expect(window.localStorage.getItem("dict:category:lookup")).toBeNull();
  });

  it("keeps the picks of the cards apart, and Save all uses the set of each word", async () => {
    const { calls, u } = await lookupPair([]);
    await pickIn(u, "hello", "Food");
    await pickIn(u, "world", "Travel");
    await u.click(screen.getByRole("button", { name: "Save all" }));
    await waitFor(() => expect(savedBodies(calls)).toHaveLength(2));
    const by = Object.fromEntries(
      savedBodies(calls).map((b) => [b.word, b.categoryIds]),
    );
    expect(by).toEqual({ hello: ["c2"], world: ["c1"] });
  });

  it("starts a card from the default the user set, and sets one from the picker", async () => {
    window.localStorage.setItem("dict:category:lookup", '["c1"]');
    const { calls, u } = await lookupPair([]);
    await u.click(
      within(screen.getByTestId("word-world")).getByRole("button", {
        name: "Categories (1)",
      }),
    );
    expect(
      (
        within(
          await screen.findByRole("group", { name: "Categories" }),
        ).getByRole("checkbox", { name: "Travel" }) as HTMLElement
      ).getAttribute("aria-checked"),
    ).toBe("true");
    await u.keyboard("{Escape}");
    await u.click(
      within(screen.getByTestId("word-world")).getByRole("button", {
        name: /^Save/,
      }),
    );
    await waitFor(() =>
      expect(savedBodies(calls)[0]?.categoryIds).toEqual(["c1"]),
    );
    // hello gets Food as well and makes both the default
    await pickIn(u, "hello", "Food");
    await u.click(
      within(screen.getByTestId("word-hello")).getByRole("button", {
        name: /^Categories/,
      }),
    );
    await u.click(
      await screen.findByRole("button", {
        name: "Use as default for new words",
      }),
    );
    expect(window.localStorage.getItem("dict:category:lookup")).toBe(
      '["c1","c2"]',
    );
    // with a default there is a button to clear it
    await u.click(await screen.findByRole("button", { name: "Clear default" }));
    expect(window.localStorage.getItem("dict:category:lookup")).toBeNull();
  });

  it("clears the default without touching what the cards show", async () => {
    window.localStorage.setItem("dict:category:lookup", '["c1"]');
    const { u } = await lookupPair([]);
    await u.click(
      within(screen.getByTestId("word-hello")).getByRole("button", {
        name: "Categories (1)",
      }),
    );
    await u.click(await screen.findByRole("button", { name: "Clear default" }));
    expect(screen.queryByRole("button", { name: "Clear default" })).toBeNull();
    expect(window.localStorage.getItem("dict:category:lookup")).toBeNull();
    await u.keyboard("{Escape}");
    // both cards still have Travel ticked
    expect(
      within(screen.getByTestId("word-hello")).getByRole("button", {
        name: "Categories (1)",
      }),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("word-world")).getByRole("button", {
        name: "Categories (1)",
      }),
    ).toBeTruthy();
  });

  it("changes the categories of a saved word in its card with no save, and undoes it on an error", async () => {
    let fail = false;
    const { calls, u } = await lookupPair([row("hello", ["c1"])], (c) =>
      c.path === "/api/dictionary/saved-words/categories"
        ? fail
          ? { status: 500, body: { code: "internal", message: "boom" } }
          : ok({ updated: 1 })
        : undefined,
    );
    const card = () => screen.getByTestId("word-hello");
    await waitFor(() =>
      expect(
        within(card()).getByRole("button", { name: "Categories (1)" }),
      ).toBeTruthy(),
    );
    await pickIn(u, "hello", "Food");
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/saved-words/categories")
          ?.body,
      ).toEqual({
        group: "en",
        words: ["hello"],
        addCategoryIds: ["c2"],
        removeCategoryIds: [],
      }),
    );
    expect(savedBodies(calls)).toHaveLength(0);
    await waitFor(() =>
      expect(
        within(card()).getByRole("button", { name: "Categories (2)" }),
      ).toBeTruthy(),
    );
    fail = true;
    await pickIn(u, "hello", "Travel");
    // the removal failed: the card is back to two categories
    await waitFor(() =>
      expect(
        within(card()).getByRole("button", { name: "Categories (2)" }),
      ).toBeTruthy(),
    );
    expect(
      calls.filter(
        (c) => c.path === "/api/dictionary/saved-words/categories",
      )[1]?.body,
    ).toEqual({
      group: "en",
      words: ["hello"],
      addCategoryIds: [],
      removeCategoryIds: ["c1"],
    });
  });

  it("puts a category created in a card on that card", async () => {
    let created = false;
    const { calls, u } = await lookupPair([], (c) => {
      if (c.path === "/api/dictionary/categories" && c.method === "POST") {
        created = true;
        return ok({ category: { id: "c3", name: "Work" } });
      }
      if (
        c.path === "/api/dictionary/categories?group=en" &&
        c.method === "GET" &&
        created
      )
        return ok({
          ...cats,
          categories: [...cats.categories, { id: "c3", name: "Work" }],
        });
      return undefined;
    });
    await u.click(
      within(screen.getByTestId("word-world")).getByRole("button", {
        name: /^Categories/,
      }),
    );
    await u.type(await screen.findByLabelText("New category name"), "Work");
    await u.click(screen.getByRole("button", { name: "Create category" }));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("word-world")).getByRole("button", {
          name: "Categories (1)",
        }),
      ).toBeTruthy(),
    );
    expect(
      calls.some(
        (c) => c.path === "/api/dictionary/categories" && c.method === "POST",
      ),
    ).toBe(true);
  });

  it("reviews one category", async () => {
    const queue = {
      cards: [],
      dueCount: 0,
      learningCount: 0,
      newCount: 0,
      totalCount: 0,
    };
    const calls = setup(
      ["dictionary:word:read"],
      (c) => {
        if (c.path === "/api/dictionary/categories?group=en") return ok(cats);
        if (c.path.startsWith("/api/dictionary/review") && c.method === "GET")
          return ok(queue);
        return undefined;
      },
      "/review",
    );
    const u = userEvent.setup();
    await pick(u, await screen.findByLabelText("Review category"), "c1");
    await waitFor(() =>
      expect(
        calls.some((c) => c.path === "/api/dictionary/review?group=en&categoryId=c1"),
      ).toBe(true),
    );
    // no words in a category is not "no saved words yet"
    expect(
      await screen.findByText("No saved words in this category yet."),
    ).toBeTruthy();
    await pick(u, screen.getByLabelText("Review category"), "none");
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.path === "/api/dictionary/review?group=en&categoryId=uncategorized",
        ),
      ).toBe(true),
    );
  });
});

describe("review: FSRS intervals and counts", () => {
  const read = ["dictionary:word:read"];
  const card = (w: string, intervals: string[]) => ({
    word: w,
    group: "en",
    content: `<b>meaning of ${w}</b>`,
    audioUk: "",
    audioUs: "",
    isNew: true,
    learning: false,
    gradeIntervalsSeconds: intervals,
  });
  const route =
    (q: unknown, post: (c: Call) => { body: unknown }) => (c: Call) => {
      if (c.path.startsWith("/api/dictionary/review") && c.method === "GET")
        return { body: q };
      if (c.path === "/api/dictionary/review" && c.method === "POST")
        return post(c);
      return undefined;
    };

  it("shows the intervals of the card again from the answer of the service", async () => {
    setup(
      read,
      route(
        {
          cards: [
            card("alpha", ["600", "86400", "172800", "691200"]),
            card("beta", ["600", "86400", "172800", "691200"]),
          ],
          newCount: 2,
          totalCount: 2,
        },
        () => ({
          body: {
            dueAt: "2026-11-25T00:10:00Z",
            intervalSeconds: "600",
            // FSRS: after Again the card has other steps than the SM-2 learning ones
            gradeIntervalsSeconds: ["300", "900", "7200", "86400"],
          },
        }),
      ),
      "/review",
    );
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Start" }));
    await u.keyboard(" ");
    expect(screen.getByRole("button", { name: /Good\s*2d/ })).toBeTruthy();
    await u.keyboard("1"); // alpha: Again
    await waitFor(() =>
      expect(screen.getByTestId("review-word").textContent).toBe("beta"),
    );
    await u.keyboard(" ");
    await u.keyboard("3"); // beta: Good (the mock answers 10m, so it goes back too)
    await waitFor(() =>
      expect(screen.getByTestId("review-word").textContent).toBe("alpha"),
    );
    await u.keyboard(" ");
    expect(screen.getByRole("button", { name: /Again\s*5m/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Good\s*2h/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Easy\s*1d/ })).toBeTruthy();
  });

  it("shows 10000+ for the cards held back when the count is capped", async () => {
    setup(
      read,
      route(
        {
          cards: [],
          totalCount: 10000,
          newHeld: 10000,
          dueHeld: 12,
          countsCapped: true,
        },
        () => ({ body: {} }),
      ),
      "/review",
    );
    const more = await screen.findByTestId("review-more");
    expect(more.textContent).toContain("10000+ new words");
  });
});

describe("review: study more today", () => {
  const read = ["dictionary:word:read"];
  const base = {
    cards: [],
    dueCount: 0,
    learningCount: 0,
    newCount: 0,
    totalCount: 9,
  };
  const route = (queues: Record<string, unknown>[]) => {
    let n = 0;
    return (c: Call) => {
      if (
        c.path.startsWith("/api/dictionary/review/bonus") &&
        c.method === "POST"
      )
        return { body: { extraNew: 3 } };
      if (c.path.startsWith("/api/dictionary/review") && c.method === "GET")
        return { body: queues[Math.min(n++, queues.length - 1)] };
      return undefined;
    };
  };
  const bonusPosts = (calls: Call[]) =>
    calls.filter(
      (c) => c.method === "POST" && c.path === "/api/dictionary/review/bonus",
    );

  it("is hidden when nothing is held back", async () => {
    setup(read, route([{ ...base, newCount: 1 }]), "/review");
    await screen.findByTestId("review-new");
    expect(screen.queryByTestId("review-more")).toBeNull();
  });

  it("stays hidden while there are cards to study", async () => {
    setup(
      read,
      route([{ ...base, newCount: 2, newHeld: 4, dueHeld: 3 }]),
      "/review",
    );
    await screen.findByTestId("review-new");
    expect(screen.queryByTestId("review-more")).toBeNull();
  });

  it("shows only the kind that is held back, with the cards left", async () => {
    setup(read, route([{ ...base, newHeld: 4 }]), "/review");
    expect(await screen.findByTestId("review-more")).toBeTruthy();
    expect(screen.queryByLabelText("New words")).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Study more today" }));
    expect(screen.getByLabelText("New words")).toBeTruthy();
    expect(screen.queryByLabelText("Cards to review")).toBeNull();
    expect(screen.getByText("4 left")).toBeTruthy();
  });

  it("sends the numbers and reads the queue again", async () => {
    const calls = setup(
      read,
      route([
        { ...base, newHeld: 5, dueHeld: 7 },
        { ...base, newCount: 3, newHeld: 2, dueHeld: 7 },
      ]),
      "/review",
    );
    const u = userEvent.setup();
    await u.click(
      await screen.findByRole("button", { name: "Study more today" }),
    );
    const field = await screen.findByLabelText("New words");
    await u.clear(field);
    await u.type(field, "3");
    const reviews = screen.getByLabelText("Cards to review");
    await u.clear(reviews);
    await u.type(reviews, "6");
    await u.click(screen.getByRole("button", { name: "Study more" }));
    await waitFor(() =>
      expect(bonusPosts(calls).map((c) => c.body)).toEqual([
        { newWords: 3, reviews: 6 },
      ]),
    );
    // the new cards are ready to study, so the form steps aside
    expect((await screen.findByTestId("review-new")).textContent).toBe("3");
    expect(screen.queryByTestId("review-more")).toBeNull();
  });

  it("fills the field from the quick amounts", async () => {
    setup(read, route([{ ...base, newHeld: 30 }]), "/review");
    const u = userEvent.setup();
    await u.click(
      await screen.findByRole("button", { name: "Study more today" }),
    );
    const field = screen.getByLabelText("New words") as HTMLInputElement;
    await u.click(screen.getByRole("button", { name: "+20" }));
    expect(field.value).toBe("20");
    expect(screen.queryByRole("button", { name: "+50" })).toBeNull();
    await u.click(screen.getByRole("button", { name: "All 30" }));
    expect(field.value).toBe("30");
  });

  it("flags a number out of range", async () => {
    const calls = setup(read, route([{ ...base, newHeld: 5 }]), "/review");
    const u = userEvent.setup();
    await u.click(
      await screen.findByRole("button", { name: "Study more today" }),
    );
    const field = await screen.findByLabelText("New words");
    const button = screen.getByRole("button", {
      name: "Study more",
    }) as HTMLButtonElement;
    for (const bad of ["0", "6"]) {
      await u.clear(field);
      await u.type(field, bad);
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(button.disabled).toBe(true);
    }
    await u.clear(field);
    expect(button.disabled).toBe(true);
    await u.type(field, "5");
    expect(field.getAttribute("aria-invalid")).toBeNull();
    expect(button.disabled).toBe(false);
    expect(bonusPosts(calls)).toEqual([]);
  });
});

describe("review algorithm in the settings", () => {
  const read = ["dictionary:word:read"];
  const user = {
    dictionaries: { english: true, "english-vietnamese": true },
    defaultDictionary: "english",
    removeAfterExport: true,
    removeAcknowledged: true,
    maxLookupWords: 20,
    reviewNewPerDay: 10,
    reviewMaxPerDay: 200,
  };
  const system = {
    maxSavedWords: 100,
    allowExportDeck: true,
    allowExportLink: true,
    dictionaries: { english: true, "english-vietnamese": true },
    removeAfterExport: true,
  };
  const route =
    (mine: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    (c: Call) => {
      if (c.path === "/api/dictionary/me/settings" && c.method === "GET")
        return { body: { user: mine, system, ...extra } };
      if (c.path === "/api/dictionary/me/settings" && c.method === "PUT")
        return { body: { user: (c.body as { user: unknown }).user, system } };
      if (c.path === "/api/dictionary/review/optimize" && c.method === "POST")
        return (c.body as { restoreDefaults?: boolean }).restoreDefaults
          ? { body: {} }
          : {
              body: {
                applied: true,
                reviewCount: 640,
                lossDefault: 0.412,
                lossTrained: 0.371,
                trainedAt: "2026-11-26T08:00:00Z",
              },
            };
      return undefined;
    };

  it("defaults to SM-2 without a retention field", async () => {
    setup(read, route(user), "/settings");
    await screen.findByLabelText("Reviews per day");
    expect(screen.queryByLabelText("Desired retention (%)")).toBeNull();
    expect(screen.queryByTestId("fsrs-parameters")).toBeNull();
  });

  it("switches to FSRS, shows the retention and sends both", async () => {
    const calls = setup(read, route(user), "/settings");
    const u = userEvent.setup();
    await screen.findByLabelText("Reviews per day");
    await u.click(screen.getByRole("radio", { name: "FSRS" }));
    const field = (await screen.findByLabelText(
      "Desired retention (%)",
    )) as HTMLInputElement;
    expect(field.value).toBe("90");
    await u.clear(field);
    await u.type(field, "85");
    await u.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => {
      const sent = calls.find((c) => c.method === "PUT")?.body as {
        user: { reviewAlgorithm: string; desiredRetention: number };
      };
      expect(sent.user.reviewAlgorithm).toBe("fsrs");
      expect(sent.user.desiredRetention).toBe(85);
    });
  });

  it("blocks a retention outside 70 to 97", async () => {
    setup(read, route({ ...user, reviewAlgorithm: "fsrs" }), "/settings");
    const u = userEvent.setup();
    const field = await screen.findByLabelText("Desired retention (%)");
    await u.clear(field);
    await u.type(field, "99");
    expect(
      (
        screen.getByRole("button", {
          name: "Save settings",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("optimizes the parameters and shows the result, then resets them", async () => {
    const calls = setup(
      read,
      route({ ...user, reviewAlgorithm: "fsrs" }),
      "/settings",
    );
    const u = userEvent.setup();
    expect(
      (await screen.findByTestId("fsrs-parameters")).textContent,
    ).toContain("default parameters");
    await u.click(screen.getByRole("button", { name: "Optimize parameters" }));
    const result = await screen.findByTestId("fsrs-result");
    expect(result.textContent).toContain("640 reviews");
    expect(result.textContent).toContain("0.412");
    expect(result.textContent).toContain("0.371");
    expect(screen.getByTestId("fsrs-parameters").textContent).toContain(
      "Fitted to 640 of your reviews",
    );
    await u.click(screen.getByRole("button", { name: "Reset to default" }));
    await waitFor(() =>
      expect(screen.getByTestId("fsrs-parameters").textContent).toContain(
        "default parameters",
      ),
    );
    const bodies = calls
      .filter((c) => c.path === "/api/dictionary/review/optimize")
      .map((c) => c.body);
    expect(bodies).toEqual([
      { restoreDefaults: false },
      { restoreDefaults: true },
    ]);
  });

  it("shows when the parameters were fitted", async () => {
    setup(
      read,
      route(
        { ...user, reviewAlgorithm: "fsrs" },
        { fsrsTrainedAt: "2026-11-20T08:00:00Z", fsrsReviewCount: 321 },
      ),
      "/settings",
    );
    expect(
      (await screen.findByTestId("fsrs-parameters")).textContent,
    ).toContain("Fitted to 321 of your reviews");
  });
});

describe("notices stay while the next action runs", () => {
  const read = ["dictionary:word:read"];
  const user = {
    dictionaries: { english: true, "english-vietnamese": true },
    defaultDictionary: "english",
    removeAfterExport: true,
    removeAcknowledged: true,
    maxLookupWords: 20,
    reviewNewPerDay: 10,
    reviewMaxPerDay: 200,
    reviewAlgorithm: "fsrs",
  };
  const system = {
    maxSavedWords: 100,
    allowExportDeck: true,
    allowExportLink: true,
    dictionaries: { english: true, "english-vietnamese": true },
    removeAfterExport: true,
  };

  it("keeps the result of Optimize on screen until the next one answers, then changes its text", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    let n = 0;
    setup(
      read,
      (c) => {
        if (c.path === "/api/dictionary/me/settings" && c.method === "GET")
          return { body: { user, system } };
        if (c.path === "/api/dictionary/review/optimize") {
          n++;
          return n === 1
            ? {
                body: {
                  applied: true,
                  reviewCount: 640,
                  lossDefault: 0.4,
                  lossTrained: 0.3,
                },
              }
            : {
                body: { applied: false, reviewCount: 700, reason: "no better" },
                wait: gate,
              };
        }
        return undefined;
      },
      "/settings",
    );
    const u = userEvent.setup();
    const button = await screen.findByRole("button", {
      name: "Optimize parameters",
    });
    await u.click(button);
    const first = await screen.findByTestId("fsrs-result");
    expect(first.textContent).toContain("640 reviews");
    // the second run is in flight: the notice is still there, the same element
    await u.click(button);
    await waitFor(() => expect(n).toBe(2));
    expect(screen.getByTestId("fsrs-result")).toBe(first);
    expect(first.textContent).toContain("640 reviews");
    release();
    await waitFor(() =>
      expect(screen.getByTestId("fsrs-result").textContent).toContain(
        "no better",
      ),
    );
  });
});

describe("storage of the user", () => {
  const MIB = 1024 * 1024;
  const lookedUp = word;
  const row = {
    word: "hello",
    content: "<div/>",
    audioUk: "",
    audioUs: "",
    createdAt: "2026-11-23T05:00:00Z",
  };
  const list = { words: [row], nextPageToken: "", total: 1 };
  /** The gateway writes int64 as a string and leaves out a 0. */
  const usage = (used: number, limit: number) => ({
    used: String(used),
    limit: String(limit),
  });
  const storage = (content: ReturnType<typeof usage>) => ({
    content,
    image: usage(3 * MIB, 20 * MIB),
    audio: usage(10 * MIB, 10 * MIB),
  });
  const serve =
    (state: { storage: object }, rest: (c: Call) => { body: unknown } | undefined = () => undefined) =>
    (c: Call) => {
      if (c.path === "/api/dictionary/me/storage") return { body: state.storage };
      if (c.path.startsWith("/api/dictionary/saved") && c.method === "GET")
        return { body: list };
      return rest(c);
    };

  it("shows used / limit of content, images and audio in Settings", async () => {
    setup(
      ["dictionary:word:*"],
      serve({ storage: storage(usage(12.4 * MIB, 256 * MIB)) }),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-settings"));
    const content = await screen.findByTestId("storage-content");
    expect(content.textContent).toContain("12.4 MiB / 256 MiB");
    expect(screen.getByTestId("storage-image").textContent).toContain(
      "3 MiB / 20 MiB",
    );
    const audio = screen.getByTestId("storage-audio");
    expect(audio.textContent).toContain("10 MiB / 10 MiB");
    // 90 % or more is flagged, less is not
    expect(audio.querySelector(".text-destructive")).not.toBeNull();
    expect(content.querySelector(".text-destructive")).toBeNull();
  });

  it("warns on the saved page from 90 % of the content storage", async () => {
    setup(
      ["dictionary:word:*"],
      serve({ storage: storage(usage(240 * MIB, 256 * MIB)) }),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    expect((await screen.findByTestId("saved-storage")).textContent).toBe(
      "Storage: 240 MiB / 256 MiB",
    );
    expect(
      await screen.findByText(/nearly using up your storage/),
    ).toBeTruthy();
  });

  it("does not warn on the saved page below 90 %", async () => {
    setup(
      ["dictionary:word:*"],
      serve({ storage: storage(usage(100 * MIB, 256 * MIB)) }),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    expect((await screen.findByTestId("saved-storage")).textContent).toBe(
      "Storage: 100 MiB / 256 MiB",
    );
    expect(screen.queryByText(/nearly using up your storage/)).toBeNull();
  });

  it("reads the figures again after a word is deleted", async () => {
    const state = { storage: storage(usage(240 * MIB, 256 * MIB)) };
    const calls = setup(["dictionary:word:*"], serve(state));
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    await screen.findByText(/nearly using up your storage/);
    const reads = () =>
      calls.filter((c) => c.path === "/api/dictionary/me/storage").length;
    const before = reads();
    state.storage = storage(usage(10 * MIB, 256 * MIB));
    await u.click(await screen.findByRole("button", { name: "Delete hello" }));
    await u.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
    await waitFor(() =>
      expect(screen.queryByText(/nearly using up your storage/)).toBeNull(),
    );
    expect(screen.getByTestId("saved-storage").textContent).toBe(
      "Storage: 10 MiB / 256 MiB",
    );
  });

  it("explains SAVED_BYTES_EXCEEDED when a save is refused", async () => {
    setup(["dictionary:word:*"], (c) => {
      if (c.path.startsWith("/api/dictionary/words/"))
        return { body: { word: lookedUp } };
      if (c.method === "POST" && c.path === "/api/dictionary/saved")
        return {
          status: 429,
          body: {
            error: {
              code: "rate_limited",
              message: "SAVED_BYTES_EXCEEDED: the storage of the saved words is full",
            },
          },
        };
      return undefined;
    });
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Words"), "hello");
    await u.click(screen.getByRole("button", { name: "Look up" }));
    await u.click(await screen.findByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(
        "Your saved words take up all your storage. Export or delete some words first.",
      ),
    ).toBeTruthy();
  });
});

describe("dictionary registry and groups", () => {
  const W = ["dictionary:word:read", "dictionary:word:write"];
  const TWO = [EN_GROUP, X_GROUP];
  const switcher = () => screen.queryByRole("group", { name: "Dictionary group" });
  const lookups = (calls: Call[]) =>
    calls.filter((c) => c.path.startsWith("/api/dictionary/words/"));

  it("builds the tabs from the registry, and a dictionary of another group is not among them", async () => {
    setup(W, () => undefined, "/", TWO);
    expect(await screen.findByRole("tab", { name: "English" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "English - Vietnamese" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "test-x" })).toBeNull();
    // the group x has one dictionary: the choice is made by the group, so there are no tabs
    const u = userEvent.setup();
    await u.click(await screen.findByRole("radio", { name: "x" }));
    await waitFor(() => expect(screen.queryByRole("tab")).toBeNull());
  });

  it("hides the group switcher with one group", async () => {
    setup(W, () => undefined, "/", [EN_GROUP]);
    await screen.findByRole("tab", { name: "English" });
    expect(switcher()).toBeNull();
  });

  it("shows the group switcher with two groups, naming a group without a translation by its id", async () => {
    setup(W, () => undefined, "/", TWO);
    expect(
      await screen.findByRole("group", { name: "Dictionary group" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "English" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByRole("radio", { name: "x" })).toBeTruthy();
  });

  it("starts in the group of the default dictionary of the user", async () => {
    const calls = setup(
      W,
      (c) =>
        c.path === "/api/dictionary/me/settings" && c.method === "GET"
          ? { body: { user: { defaultDictionary: "test-x" }, system: {} } }
          : c.path.startsWith("/api/dictionary/words/")
            ? { body: { word } }
            : undefined,
      "/",
      TWO,
    );
    const u = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "x" }).getAttribute("aria-checked")).toBe("true"),
    );
    await u.type(screen.getByLabelText("Words"), "hello");
    await u.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText("used as a greeting");
    expect(lookups(calls).map((c) => c.path)).toEqual(["/api/dictionary/words/hello?dictionary=test-x"]);
  });

  it("saves in the group of the active tab with the dictionaries of that group only, and marks the words saved there", async () => {
    const calls = setup(
      W,
      (c) => {
        if (c.path.startsWith("/api/dictionary/words/")) return { body: { word } };
        if (c.method === "POST" && c.path === "/api/dictionary/saved") return { body: { savedCount: 1 } };
        // the word is saved in the group x only
        if (c.method === "GET" && c.path.startsWith("/api/dictionary/saved?"))
          return {
            body: {
              words: c.path.includes("group=x")
                ? [{ word: "hello", content: "", audioUk: "", audioUs: "", createdAt: "2026-11-23T05:00:00Z" }]
                : [],
              nextPageToken: "",
              total: 0,
            },
          };
        return undefined;
      },
      "/",
      TWO,
    );
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Words"), "hello");
    // the group en: both dictionaries are fetched, the word is not saved there
    await u.click(screen.getByRole("button", { name: "Look up" }));
    await u.click(await screen.findByRole("button", { name: "Save" }));
    await screen.findByText(/Saved "hello"/);
    let body = calls.find((c) => c.method === "POST" && c.path === "/api/dictionary/saved")?.body as Record<string, string>;
    expect(body.group).toBe("en");
    expect(body.content).toContain("<hr>");
    expect(lookups(calls).map((c) => c.path)).toEqual([
      "/api/dictionary/words/hello?dictionary=english",
      "/api/dictionary/words/hello?dictionary=english-vietnamese",
    ]);

    // the group x: its own dictionary is looked up again, and the word is saved there already
    calls.length = 0;
    await u.click(screen.getByRole("radio", { name: "x" }));
    await waitFor(() => expect(lookups(calls).map((c) => c.path)).toEqual(["/api/dictionary/words/hello?dictionary=test-x"]));
    await u.click(await screen.findByRole("button", { name: "Save override" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/dictionary/saved")).toBe(true));
    body = calls.find((c) => c.method === "POST" && c.path === "/api/dictionary/saved")?.body as Record<string, string>;
    expect(body.group).toBe("x");
    expect(body.content).not.toContain("<hr>");
    // only the dictionary of the group is fetched (the one shown is reused)
    expect(lookups(calls)).toHaveLength(1);
  });

  it("lists the saved words and the categories of the active group", async () => {
    const calls = setup(W, () => undefined, "/saved", TWO);
    const u = userEvent.setup();
    await u.click(await screen.findByRole("radio", { name: "x" }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/api/dictionary/saved?group=x&pageSize=50")).toBe(true),
    );
    expect(calls.some((c) => c.path === "/api/dictionary/categories?group=x")).toBe(true);
  });

  it("shows one switch per dictionary of the registry in Settings, by group, and saves the map", async () => {
    const settings = (c: Call) =>
      c.path === "/api/dictionary/me/settings" && c.method === "GET"
        ? {
            body: {
              user: { defaultDictionary: "english", dictionaries: { english: true, "english-vietnamese": true, "test-x": true } },
              system: { dictionaries: { english: true, "english-vietnamese": true, "test-x": true } },
            },
          }
        : undefined;
    const calls = setup(["dictionary:word:read"], settings, "/settings", TWO);
    const u = userEvent.setup();
    const en = await screen.findByTestId("group-en");
    expect(within(en).getAllByRole("switch").map((s) => s.getAttribute("aria-label") ?? s.textContent)).toBeTruthy();
    expect(within(en).getByRole("switch", { name: "English - Vietnamese" })).toBeTruthy();
    // no name for the group or the dictionary: the id stands in
    const x = screen.getByTestId("group-x");
    expect(within(x).getByRole("heading", { name: "x" })).toBeTruthy();
    await u.click(within(x).getByRole("switch", { name: "test-x" }));
    await u.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeTruthy());
    const put = calls.find((c) => c.method === "PUT")?.body as { user: { dictionaries: Record<string, boolean> } };
    expect(put.user.dictionaries).toEqual({ english: true, "english-vietnamese": true, "test-x": false });
  });
});
