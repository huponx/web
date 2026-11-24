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
import { fireEvent } from "@testing-library/react";

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

function setup(
  perms: string[],
  route: (c: Call) => { status?: number; body: unknown } | undefined = () =>
    undefined,
  start = "/",
) {
  const calls: Call[] = [];
  const me: Me = {
    sub: "ann",
    roles: [],
    scopes: [],
    perms,
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
      const call: Call = {
        method: init?.method ?? "GET",
        path: url.pathname + url.search,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      const r = route(call);
      if (!r) return new Response("{}", { status: 200 });
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
          <RouterProvider router={createMemoryRouter([{ path: "*", element: <App /> }], { initialEntries: [start] })} />
        </AuthProvider>
      </StyleProvider>
    </ThemeProvider>,
  );
  return calls;
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
          "/api/dictionary/words/hello?dictionary=DICTIONARY_ENGLISH",
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
      dictionary: "DICTIONARY_ENGLISH_VIETNAMESE",
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
    ).toEqual({ words: ["hello", "zzz"], dictionary: "DICTIONARY_ENGLISH" });
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
      "/api/dictionary/words/hello?dictionary=DICTIONARY_ENGLISH_VIETNAMESE",
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
    expect(card.querySelector("ol li i")?.textContent).toBe("an apple a day"); // real list and italics, not tags as text
    expect(card.textContent).not.toContain("<");
    expect(card.textContent).not.toContain("replace_audio");
    expect(card.querySelector("script")).toBeNull();
    await user.click(card);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "apple" })).toBeTruthy();
    expect(within(dialog).getByText("a fruit")).toBeTruthy();
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

    await user.click(screen.getByRole("button", { name: "Export Anki deck" }));
    expect(
      await screen.findByText(/Exported 1 words to My Words.apkg/),
    ).toBeTruthy();
    expect(
      calls.find((c) => c.path === "/api/dictionary/export")?.body,
    ).toEqual({ deckName: "My Words", scope: "EXPORT_SCOPE_NEW" });
    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    anchor.mockRestore();
    vi.unstubAllGlobals();
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
    await user.click(screen.getByRole("button", { name: "Export as link" }));
    const field = (await screen.findByLabelText(
      "Download link",
    )) as HTMLInputElement;
    expect(field.value).toBe(
      "https://api.example.com/api/dictionary/downloads/tok123.apkg",
    );
    expect(
      calls.find((c) => c.path === "/api/dictionary/export-link")?.body,
    ).toEqual({ deckName: "My Words", scope: "EXPORT_SCOPE_NEW" });
    expect(
      await screen.findByText(/Exported 1 words to My Words.apkg/),
    ).toBeTruthy();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(field.value));
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
      await screen.findByText("No saved word matches your search."),
    ).toBeTruthy();
    // the list is not empty, only the search: the totals stay
    expect(screen.queryByText(/No saved words yet/)).toBeNull();
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
          c.method === "DELETE" && c.path === "/api/dictionary/saved/hello",
      ),
    ).toBe(true);
  });
});

describe("dictionary settings", () => {
  const system = {
    maxSavedWords: 100,
    allowExportDeck: true,
    allowExportLink: true,
    englishEnabled: true,
    englishViEnabled: true,
    removeAfterExport: true,
  };
  const user = {
    englishEnabled: true,
    englishViEnabled: true,
    defaultDictionary: "DICTIONARY_ENGLISH",
    deckName: "",
    maxLookupWords: 20,
    removeAfterExport: true,
    removeAcknowledged: true,
    freshDeck: false,
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
      withSettings({}, { englishViEnabled: false }),
    );
    await screen.findByLabelText("Words");
    await waitFor(() => expect(screen.queryByRole("tab")).toBeNull());
  });

  it("starts with the default dictionary of the user", async () => {
    const calls = setup(
      ["dictionary:word:read"],
      withSettings(
        { defaultDictionary: "DICTIONARY_ENGLISH_VIETNAMESE" },
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
          "/api/dictionary/words/hello?dictionary=DICTIONARY_ENGLISH_VIETNAMESE",
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
    expect(screen.queryByRole("button", { name: "Export as link" })).toBeNull();
    await u.click(screen.getByRole("button", { name: "Export Anki deck" }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/export")?.body,
      ).toEqual({ deckName: "Mine", scope: "EXPORT_SCOPE_NEW" }),
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
    expect(
      screen.queryByRole("button", { name: "Export Anki deck" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Export as link" })).toBeNull();
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
    await u.click(screen.getByRole("button", { name: "Export Anki deck" }));
    expect(
      await screen.findByText("An administrator turned this off."),
    ).toBeTruthy();
  });

  it("shows the Settings page with the dictionary the administrator turned off disabled, and saves the preferences", async () => {
    const calls = setup(
      ["dictionary:word:read"],
      withSettings({ maxLookupWords: 7 }, { englishViEnabled: false }, (c) =>
        c.method === "PUT"
          ? {
              body: {
                user: { ...user, deckName: "Mine", maxLookupWords: 5 },
                system: { ...system, englishViEnabled: false },
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
          englishViEnabled: true,
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
    const sw = await screen.findByRole("switch", { name: "New deck on every export" });
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
    englishEnabled: true,
    englishViEnabled: true,
    removeAfterExport: true,
  };
  const user = {
    englishEnabled: true,
    englishViEnabled: true,
    defaultDictionary: "DICTIONARY_ENGLISH",
    deckName: "",
    maxLookupWords: 20,
    removeAfterExport: true,
    removeAcknowledged: true,
    freshDeck: false,
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
    await u.click(screen.getByRole("button", { name: "Export Anki deck" }));
    expect(await screen.findByText("What do you want to export?")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Export all (2)" }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/export")?.body,
      ).toEqual({ deckName: "My Words", scope: "EXPORT_SCOPE_ALL" }),
    );
    expect(await screen.findByText(/They stay in your list/)).toBeTruthy();
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
    await u.click(screen.getByRole("button", { name: "Export as link" }));
    await u.click(
      await screen.findByRole("button", { name: "Export new only (1)" }),
    );
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/export-link")?.body,
      ).toEqual({ deckName: "My Words", scope: "EXPORT_SCOPE_NEW" }),
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
    await u.click(screen.getByRole("button", { name: "Export Anki deck" }));
    expect(
      (
        await screen.findByRole("button", { name: "Export new only (0)" })
      ).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("exports without asking when no word was exported before", async () => {
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
    await u.click(screen.getByRole("button", { name: "Export Anki deck" }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/api/dictionary/export")?.body,
      ).toEqual({ deckName: "My Words", scope: "EXPORT_SCOPE_NEW" }),
    );
    expect(screen.queryByText("What do you want to export?")).toBeNull();
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
    words: [{ word: "apple", content, audioUk: "https://api.dictionaryapi.dev/uk.mp3", audioUs: "", createdAt: "2026-11-23T05:00:00Z" }],
    nextPageToken: "",
    total: 1,
  });
  const route = (c: Call) => {
    if (c.method === "GET" && c.path.startsWith("/api/dictionary/saved")) return { body: saved() };
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
    fireEvent.paste(box, { clipboardData: { files: [file], getData: () => "", items: [] } });
  }

  it("edits a saved card in its dialog and saves it again", async () => {
    const calls = setup(["dictionary:word:read", "dictionary:word:write"], route, "/saved");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open apple" }));
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const box = await editor();
    expect(box.textContent).toContain("old text");
    await user.click(box);
    await user.keyboard(" more");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/dictionary/saved")).toBe(true));
    const body = calls.find((c) => c.method === "POST" && c.path === "/api/dictionary/saved")!.body as Record<string, string>;
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
    await userEvent.setup().click(await screen.findByRole("button", { name: "Open apple" }));
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("rejects an audio address that is not https", async () => {
    const calls = setup(["dictionary:word:read", "dictionary:word:write"], route, "/saved");
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
    const { calls, user } = await lookupHello(["dictionary:word:read", "dictionary:word:write"]);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled(); // not while editing
    const box = await editor();
    await user.click(box);
    await user.keyboard("{Control>}a{/Control}my own words");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("my own words")).toBeTruthy();
    expect(calls.filter((c) => c.path.startsWith("/api/dictionary/words/")).length).toBe(1); // editing fetched nothing
    expect(screen.getByText("edited")).toBeTruthy();
    expect(screen.queryByText("used as a greeting")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/dictionary/saved")).toBe(true));
    const body = calls.find((c) => c.method === "POST" && c.path === "/api/dictionary/saved")!.body as Record<string, string>;
    expect(body.content!.startsWith("<p>my own words</p><hr>")).toBe(true);
    // the other dictionary was fetched once, by the Save
    expect(calls.filter((c) => c.path.startsWith("/api/dictionary/words/")).length).toBe(2);
    await user.click(screen.getByRole("button", { name: "Revert" }));
    expect(await screen.findByText("used as a greeting")).toBeTruthy();
  });

  it("uploads a pasted image and inserts it as a dictimg reference", async () => {
    const { calls, user } = await lookupHello(["dictionary:word:read", "dictionary:word:write"]);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const box = await editor();
    pasteImage(box);
    await waitFor(() => expect(box.querySelector("img")).not.toBeNull());
    expect(downscaleImage).toHaveBeenCalled();
    expect(calls.find((c) => c.path === "/api/dictionary/images")?.body).toEqual({ contentType: "image/webp", data: "AAAA" });
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/dictionary/saved" && c.method === "POST")).toBe(true));
    const body = calls.find((c) => c.path === "/api/dictionary/saved" && c.method === "POST")!.body as Record<string, string>;
    expect(body.content).toContain(`<img src="dictimg:${ID}">`);
  });

  it("resizes an image by dragging its corner handle, clamped, and saves the width", async () => {
    const { calls, user } = await lookupHello(["dictionary:word:read", "dictionary:word:write"]);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const box = await editor();
    pasteImage(box);
    await waitFor(() => expect(box.querySelector("img.card-image")).not.toBeNull());
    const img = box.querySelector("img.card-image")!;
    // the view is rebuilt after each drag, so the layout is faked on the prototypes
    let shown = 200;
    vi.spyOn(HTMLImageElement.prototype, "offsetWidth", "get").mockImplementation(() => shown);
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
    expect(box.querySelector("img.card-image")!.getAttribute("width")).toBe("24");
    drag(1000);
    expect(box.querySelector("img.card-image")!.getAttribute("width")).toBe("500");
    shown = 500;
    drag(-150);
    expect(box.querySelector("img.card-image")!.getAttribute("width")).toBe("350");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/dictionary/saved" && c.method === "POST")).toBe(true));
    const body = calls.find((c) => c.path === "/api/dictionary/saved" && c.method === "POST")!.body as Record<string, string>;
    expect(body.content).toContain('width="350"');
  });

  it("shows the problem when the image cannot be uploaded", async () => {
    vi.mocked(downscaleImage).mockRejectedValueOnce(new ImageError("tooLarge"));
    const { user } = await lookupHello(["dictionary:word:read", "dictionary:word:write"]);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    pasteImage(await editor());
    expect(await screen.findByText(/too large even after shrinking/)).toBeTruthy();
  });

  it("reads a saved image once and shows it through a blob URL", async () => {
    clearImageCache();
    const create = vi.fn(() => "blob:img-1");
    URL.createObjectURL = create;
    const calls = setup(
      ["dictionary:word:read"],
      (c) => {
        if (c.path === `/api/dictionary/images/${ID}`) return { body: { contentType: "image/webp", data: "AAAA" } };
        if (c.method === "GET" && c.path.startsWith("/api/dictionary/saved")) return { body: saved(`<div>pic</div><img src="dictimg:${ID}">`) };
        return route(c);
      },
      "/saved",
    );
    const user = userEvent.setup();
    for (let i = 0; i < 2; i++) {
      await user.click(await screen.findByRole("button", { name: "Open apple" }));
      const dialog = await screen.findByRole("dialog");
      await waitFor(() => expect(dialog.querySelector("img")?.getAttribute("src")).toBe("blob:img-1"));
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
    expect(calls.filter((c) => c.path === `/api/dictionary/images/${ID}`).length).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("card editing of both dictionaries and unsaved edits", () => {
  const W = ["dictionary:word:read", "dictionary:word:write"];
  const viWord = { ...word, audioUk: "", meanings: [{ definition: "xin chào", examples: [], machineTranslated: false }] };
  const lookupPath = (c: Call) => c.path.startsWith("/api/dictionary/words/");
  const make = (other: { status?: number; body: unknown } = { body: { word: viWord } }) => (c: Call) => {
    if (lookupPath(c)) return c.path.includes("DICTIONARY_ENGLISH_VIETNAMESE") ? other : { body: { word } };
    if (c.path === "/api/dictionary/saved" && c.method === "POST") return { body: { savedCount: 1 } };
    if (c.method === "GET" && c.path.startsWith("/api/dictionary/saved")) return { body: { words: [], nextPageToken: "", total: 0 } };
    return undefined;
  };
  async function lookup(route: (c: Call) => { status?: number; body: unknown } | undefined) {
    const calls = setup(W, route);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText("used as a greeting");
    return { calls, user };
  }
  const box = () => screen.findByRole("textbox", { name: "Card editor" });
  const saveBody = (calls: Call[]) => calls.find((c) => c.method === "POST" && c.path === "/api/dictionary/saved")?.body as Record<string, string> | undefined;

  const VI_TAB = { name: "English - Vietnamese" };
  const viLookups = (calls: Call[]) => calls.filter((c) => lookupPath(c) && c.path.includes("DICTIONARY_ENGLISH_VIETNAMESE"));

  async function applyEdit(user: ReturnType<typeof userEvent.setup>, text = "mine") {
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
      if (c.path === "/api/dictionary/lookup") return { body: { words: [hi, nw], notFound: [] } };
      if (lookupPath(c)) return { body: { word: { ...(c.path.includes("/new") ? nw : hi), meanings: c.path.includes("VIETNAMESE") ? viWord.meanings : word.meanings } } };
      if (c.method === "GET" && c.path.startsWith("/api/dictionary/saved")) return { body: { words: [], nextPageToken: "", total: 0 } };
      return undefined;
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hi, new");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByTestId("word-hi");
    await user.click(within(screen.getByTestId("word-hi")).getByRole("button", { name: "Edit" }));
    await user.click(await box());
    await user.keyboard("{Control>}a{/Control}mine");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    const single = () => calls.filter(lookupPath).map((c) => c.path);
    const many = () => calls.filter((c) => c.path === "/api/dictionary/lookup").map((c) => (c.body as { dictionary: string }).dictionary);
    // no edit in this dictionary yet: both words are fetched
    await user.click(screen.getByRole("tab", VI_TAB));
    await waitFor(() => expect(many()).toEqual(["DICTIONARY_ENGLISH", "DICTIONARY_ENGLISH_VIETNAMESE"]));
    await user.click(within(await screen.findByTestId("word-hi")).getByRole("button", { name: "Edit" }));
    await user.click(await box());
    await user.keyboard("{Control>}a{/Control}minevi");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    // back: hi keeps its edit and is not fetched, new is
    await user.click(screen.getByRole("tab", { name: "English" }));
    await waitFor(() => expect(single()).toEqual(["/api/dictionary/words/new?dictionary=DICTIONARY_ENGLISH"]));
    expect(within(await screen.findByTestId("word-hi")).getByText("mine")).toBeTruthy();
    await user.click(screen.getByRole("tab", VI_TAB));
    await waitFor(() => expect(single()).toHaveLength(2));
    expect(single()[1]).toContain("/new?dictionary=DICTIONARY_ENGLISH_VIETNAMESE");
    expect(within(await screen.findByTestId("word-hi")).getByText("minevi")).toBeTruthy();
  });

  it.each([
    ["has no entry", { status: 404, body: { error: { code: "not_found", message: "x" } } }],
    ["is off", { status: 403, body: { error: { code: "forbidden", message: "DICTIONARY_DISABLED: off" } } }],
  ])("saves one dictionary when the other %s", async (_name, other) => {
    const { calls, user } = await lookup(make(other));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveBody(calls)).toBeTruthy());
    expect(saveBody(calls)!.content).toContain("used as a greeting");
    expect(saveBody(calls)!.content).not.toContain("<hr>");
  });

  it("shows a notice and saves nothing when the other dictionary fails on Save", async () => {
    const { calls, user } = await lookup(make({ status: 500, body: { error: { code: "internal", message: "boom" } } }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(saveBody(calls)).toBeUndefined();
  });

  it("applies the edit with Ctrl+Enter, without a line break", async () => {
    const { user } = await lookup(make());
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(await box());
    await user.keyboard("{Control>}a{/Control}quick{Control>}{Enter}{/Control}");
    expect(await screen.findByText("quick")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Card editor" })).toBeNull();
  });

  it("asks before a new lookup drops unsaved edits", async () => {
    const { user } = await lookup(make());
    await applyEdit(user);
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText("Looking up again will discard your unsaved edits.")).toBeTruthy();
  });

  it("warns on leaving with unsaved edits; Stay keeps them, Leave goes", async () => {
    const { user } = await lookup(make());
    await applyEdit(user);
    await user.click(screen.getByTestId("nav-saved"));
    expect(await screen.findByText("Your edits to the cards are not saved. Leaving this page will discard them.")).toBeTruthy();
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
  const notFound = { status: 404, body: { error: { code: "not_found", message: "x" } } };
  const down = { status: 503, body: { error: { code: "unavailable", message: "Service unavailable" } } };
  const make = (words: { status?: number; body: unknown }) => (c: Call) => {
    if (c.method === "GET" && c.path.startsWith("/api/dictionary/saved")) return { body: { words: [{ word: "serendipity", content: "x", audioUk: "", audioUs: "", createdAt: "2026-11-23T05:00:00Z" }], nextPageToken: "", total: 1 } };
    if (c.method === "POST" && c.path === "/api/dictionary/saved") return { body: { savedCount: 2 } };
    if (c.path.startsWith("/api/dictionary/words/")) return words;
    return undefined;
  };
  const post = (calls: Call[]) => calls.find((c) => c.method === "POST" && c.path === "/api/dictionary/saved");

  async function typeInto(user: ReturnType<typeof userEvent.setup>, text: string) {
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
    await user.click(screen.getByRole("button", { name: "Create card manually" }));
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
    await user.click(await screen.findByRole("button", { name: "Create card manually" }));
    await screen.findByRole("textbox", { name: "Card editor" });
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText(/Write something first/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("word-zzz")).toBeNull();
    expect(screen.getByText("No entry for: zzz")).toBeTruthy();
  });

  it("offers a card per word when several are missing", async () => {
    setup(WRITE, (c) => (c.path === "/api/dictionary/lookup" ? { body: { words: [word], notFound: ["aaa", "bbb"] } } : undefined));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello, aaa, bbb");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(await screen.findByRole("button", { name: "Create card: bbb" }));
    expect(await screen.findByTestId("word-bbb")).toBeTruthy();
    expect(screen.getByText("No entry for: aaa")).toBeTruthy();
  });

  it("offers to write the cards when the lookup fails, and saves without the dictionary", async () => {
    const calls = setup(WRITE, make(down));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText(/dictionary is unavailable/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Create card: hello" }));
    await typeInto(user, "hi there");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(post(calls)).toBeTruthy());
    expect((post(calls)!.body as Record<string, string>).content).toContain("hi there");
  });

  it("creates a card for any word with New card, checking the word", async () => {
    const calls = setup(WRITE, make(notFound));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "New card" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Continue to editor" }));
    expect(await within(dialog).findByText("Enter a word.")).toBeTruthy();
    await user.type(within(dialog).getByLabelText("Word"), "abc!");
    expect(within(dialog).getByRole("alert").textContent).toMatch(/letters, digits/);
    await user.clear(within(dialog).getByLabelText("Word"));
    await user.type(within(dialog).getByLabelText("Word"), "serendipity");
    expect(within(dialog).getByText(/already saved/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Continue to editor" }));
    await typeInto(user, "new text");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.click(await screen.findByRole("button", { name: "Save override" }));
    await waitFor(() => expect(post(calls)).toBeTruthy());
    expect((post(calls)!.body as Record<string, string>).word).toBe("serendipity");
  });

  it("hides the buttons without the write permission", async () => {
    setup(["dictionary:word:read"], make(notFound));
    const user = userEvent.setup();
    expect(screen.queryByRole("button", { name: "New card" })).toBeNull();
    await user.type(await screen.findByLabelText("Words"), "zzz");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText("No entry for: zzz")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create card manually" })).toBeNull();
  });
});
