import { AuthProvider, createClient } from "@huponx/auth-client";
import type { Me } from "@huponx/auth-client";
import { ThemeProvider } from "@huponx/ui-kit";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

const word = {
  text: "hello",
  phonetic: "",
  phoneticUk: "/həˈləʊ/",
  phoneticUs: "/həˈloʊ/",
  audioUk: "https://api.dictionaryapi.dev/uk.mp3",
  audioUs: "",
  partOfSpeech: ["exclamation"],
  meanings: [{ definition: "used as a greeting", examples: ["Hello, John!"], machineTranslated: false }],
};

interface Call {
  method: string;
  path: string;
  body?: unknown;
}

function setup(perms: string[], route: (c: Call) => { status?: number; body: unknown } | undefined = () => undefined, start = "/") {
  const calls: Call[] = [];
  const me: Me = { sub: "ann", roles: [], scopes: [], perms, amr: [], csrf_token: "c", expires_at: "2030-01-01T00:00:00Z" };
  const client = createClient({
    apiBase: "https://api.example.com",
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/me") return new Response(JSON.stringify(me), { status: 200 });
      const call: Call = { method: init?.method ?? "GET", path: url.pathname + url.search, body: init?.body ? JSON.parse(String(init.body)) : undefined };
      calls.push(call);
      const r = route(call);
      if (!r) return new Response("{}", { status: 200 });
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
    },
    navigate: () => undefined,
    storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  });
  render(
    <ThemeProvider>
      <AuthProvider client={client}>
        <MemoryRouter initialEntries={[start]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );
  return calls;
}

describe("dict app", () => {
  it("shows the menu only with the read permission", async () => {
    setup([]);
    expect(await screen.findByText("You are not allowed to see this page.")).toBeTruthy();
    expect(screen.queryByTestId("nav-lookup")).toBeNull();
  });

  it("looks a word up and renders its entry", async () => {
    const calls = setup(["dictionary:word:read"], (c) => (c.path.startsWith("/api/dictionary/words/") ? { body: { word } } : undefined));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText("used as a greeting")).toBeTruthy();
    expect(screen.getByText("Hello, John!")).toBeTruthy();
    expect(calls.some((c) => c.path === "/api/dictionary/words/hello?dictionary=DICTIONARY_ENGLISH")).toBe(true);
    // reading only: no Save button
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("looks several words up with the chosen dictionary and lists the missing ones", async () => {
    const calls = setup(["dictionary:word:read"], (c) => (c.path === "/api/dictionary/lookup" ? { body: { words: [word], notFound: ["zzz"] } } : undefined));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello, zzz");
    await user.click(screen.getByRole("tab", { name: "English - Vietnamese" })); // nothing looked up yet: no call
    expect(calls.some((c) => c.path === "/api/dictionary/lookup")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText("No entry for: zzz")).toBeTruthy();
    expect(calls.find((c) => c.path === "/api/dictionary/lookup")?.body).toEqual({ words: ["hello", "zzz"], dictionary: "DICTIONARY_ENGLISH_VIETNAMESE" });

    // after a lookup, switching the dictionary looks the same words up again
    await user.click(screen.getByRole("tab", { name: "English" }));
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/dictionary/lookup")).toHaveLength(2));
    expect(calls.filter((c) => c.path === "/api/dictionary/lookup")[1]?.body).toEqual({ words: ["hello", "zzz"], dictionary: "DICTIONARY_ENGLISH" });
  });

  it("saves the card with the audio placeholders and shows the limit error", async () => {
    let saved = 0;
    const calls = setup(["dictionary:word:*"], (c) => {
      if (c.path.startsWith("/api/dictionary/words/")) return { body: { word } };
      if (c.method === "POST" && c.path === "/api/dictionary/saved") {
        saved++;
        return saved === 1 ? { body: { savedCount: 1 } } : { status: 429, body: { error: { code: "rate_limited", message: "MAX_SAVED_WORDS_REACHED: 100" } } };
      }
      return undefined;
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText('Saved "hello" (1/100).')).toBeTruthy();
    const body = calls.find((c) => c.method === "POST")?.body as { word: string; content: string; audioUk: string };
    expect(body.word).toBe("hello");
    expect(body.content).toContain("replace_audio_uk");
    // both dictionaries are on the card, separated by a rule
    expect(body.content).toContain("<hr>");
    const lookups = calls.filter((c) => c.path.startsWith("/api/dictionary/words/hello")).map((c) => c.path);
    expect(lookups).toContain("/api/dictionary/words/hello?dictionary=DICTIONARY_ENGLISH_VIETNAMESE");
    expect(body.audioUk).toBe("https://api.dictionaryapi.dev/uk.mp3");

    // the word is saved now: the button says that saving again overwrites it
    await user.click(screen.getByRole("button", { name: "Save override" }));
    await waitFor(() => expect(screen.getByText(/reached the limit of saved words/)).toBeTruthy());
  });

  it("shows the saved words next to the lookup", async () => {
    const saved = { words: [{ word: "apple", content: "", audioUk: "", audioUs: "", createdAt: "2026-11-23T05:00:00Z" }], nextPageToken: "", total: 1 };
    setup(["dictionary:word:read"], (c) => (c.path.startsWith("/api/dictionary/saved") ? { body: saved } : undefined));
    expect(await screen.findByText("apple")).toBeTruthy();
    expect(screen.getByText(/1 of 100 saved words/)).toBeTruthy();
  });

  it("shows the card of a saved word as HTML, cut short, and the whole card in a dialog on click", async () => {
    const user = userEvent.setup();
    const content = '<div>UK /a/ replace_audio_uk</div><ol><li>a fruit<ul><li><i>an apple a day</i></li></ul></li></ol><script>window.hacked=1</script>';
    const saved = { words: [{ word: "apple", content, audioUk: "", audioUs: "", createdAt: "2026-11-23T05:00:00Z" }], nextPageToken: "", totalCount: 1 };
    setup(["dictionary:word:read"], (c) => (c.path.startsWith("/api/dictionary/saved") ? { body: saved } : undefined), "/saved");
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
      if (c.path.startsWith("/api/dictionary/words/")) return { body: { word } };
      if (c.path.startsWith("/api/dictionary/saved")) return { body: { words: [], totalCount: 0, nextPageToken: "" } };
      return undefined;
    });
    await user.type(await screen.findByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText("used as a greeting");
    await user.click(screen.getByTestId("nav-saved"));
    await user.click(await screen.findByTestId("nav-lookup"));
    expect((await screen.findByLabelText("Words") as HTMLTextAreaElement).value).toBe("hello");
    await user.click(screen.getByRole("button", { name: "Clear input" }));
    expect((screen.getByLabelText("Words") as HTMLTextAreaElement).value).toBe("");
  });

  it("looks up with Ctrl+Enter in the input", async () => {
    const calls = setup(["dictionary:word:read"], (c) => (c.path.startsWith("/api/dictionary/words/") ? { body: { word } } : undefined));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello{Control>}{Enter}{/Control}");
    expect(await screen.findByText("used as a greeting")).toBeTruthy();
    expect(calls.some((c) => c.path.startsWith("/api/dictionary/words/hello"))).toBe(true);
  });

  it("marks a word that is already saved and shows the notice inside its card, then removes it", async () => {
    const saved = { words: [{ word: "Hello", content: "", audioUk: "", audioUs: "", createdAt: "2026-11-23T05:00:00Z" }], nextPageToken: "", total: 1 };
    const calls = setup(["dictionary:word:*"], (c) => {
      if (c.method === "GET" && c.path.startsWith("/api/dictionary/saved")) return { body: saved };
      if (c.path.startsWith("/api/dictionary/words/")) return { body: { word } };
      if (c.method === "POST" && c.path === "/api/dictionary/saved") return { body: { savedCount: 1 } };
      return undefined;
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    const override = await screen.findByRole("button", { name: "Save override" });
    await user.click(override);
    const card = screen.getByTestId("word-hello");
    expect(await within(card).findByText('Overwrote "hello" (1/100).')).toBeTruthy();
    expect(calls.some((c) => c.method === "POST" && c.path === "/api/dictionary/saved")).toBe(true);
    await waitFor(() => expect(within(card).queryByText('Overwrote "hello" (1/100).')).toBeNull(), { timeout: 6000 });
  }, 12000);

  it("copies the input and the result as an Anki card", async () => {
    setup(["dictionary:word:read"], (c) => (c.path.startsWith("/api/dictionary/words/") ? { body: { word } } : undefined));
    const user = userEvent.setup(); // installs its own clipboard
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.type(await screen.findByLabelText("Words"), "hello");
    await user.click(screen.getByRole("button", { name: "Copy input" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("hello"));
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(await screen.findByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(await within(screen.getByTestId("word-hello")).findByText("Copied.")).toBeTruthy();
    const text = (writeText.mock.calls[1] as unknown as [string])[0];
    expect(text.startsWith("hello\t")).toBe(true);
    expect(text).not.toContain("replace_audio");
  });
});

describe("saved words", () => {
  const list = { words: [{ word: "hello", content: "<div/>", audioUk: "", audioUs: "", createdAt: "2026-11-23T05:00:00Z" }], nextPageToken: "", total: 1 };

  it("lists, deletes after a confirmation and exports a deck", async () => {
    const click = vi.fn();
    const create = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    const anchor = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
    const calls = setup(["dictionary:word:*"], (c) => {
      if (c.path.startsWith("/api/dictionary/saved") && c.method === "GET") return { body: list };
      if (c.path === "/api/dictionary/export") return { body: { filename: "My Words.apkg", data: btoa("PK"), wordCount: 1 } };
      return undefined;
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("nav-saved"));
    expect(await screen.findByText("hello")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Export Anki deck" }));
    expect(await screen.findByText(/Exported 1 words to My Words.apkg/)).toBeTruthy();
    expect(calls.find((c) => c.path === "/api/dictionary/export")?.body).toEqual({ deckName: "My Words" });
    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    anchor.mockRestore();
    vi.unstubAllGlobals();
  });

  it("exports the deck as a link an Anki app can import", async () => {
    const calls = setup(["dictionary:word:*"], (c) => {
      if (c.path.startsWith("/api/dictionary/saved") && c.method === "GET") return { body: list };
      if (c.path === "/api/dictionary/export-link") {
        return { body: { token: "tok123", filename: "My Words.apkg", wordCount: 1, expiresAt: "2030-01-01T10:15:00Z" } };
      }
      return undefined;
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("nav-saved"));
    await screen.findByText("hello");
    await user.click(screen.getByRole("button", { name: "Export as link" }));
    const field = (await screen.findByLabelText("Download link")) as HTMLInputElement;
    expect(field.value).toBe("https://api.example.com/api/dictionary/downloads/tok123.apkg");
    expect(calls.find((c) => c.path === "/api/dictionary/export-link")?.body).toEqual({ deckName: "My Words" });
    expect(await screen.findByText(/Exported 1 words to My Words.apkg/)).toBeTruthy();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(field.value));
  });

  it("filters the list with the search box", async () => {
    const many = {
      words: ["apple", "banana", "grape"].map((word) => ({ word, content: "", audioUk: "", audioUs: "", createdAt: "2026-11-23T05:00:00Z" })),
      nextPageToken: "",
      total: 3,
    };
    setup(["dictionary:word:read"], (c) => (c.path.startsWith("/api/dictionary/saved") ? { body: many } : undefined));
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("nav-saved"));
    expect(await screen.findByText("banana")).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "Search saved words" }), "AP");
    expect(screen.queryByText("banana")).toBeNull();
    expect(screen.getByText("apple")).toBeTruthy();
    await user.clear(screen.getByRole("textbox", { name: "Search saved words" }));
    await user.type(screen.getByRole("textbox", { name: "Search saved words" }), "zzz");
    expect(await screen.findByText("No saved word matches your search.")).toBeTruthy();
  });

  it("deletes a word after the confirmation", async () => {
    const calls = setup(["dictionary:word:*"], (c) => (c.path.startsWith("/api/dictionary/saved") && c.method === "GET" ? { body: list } : undefined));
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("nav-saved"));
    await user.click(await screen.findByRole("button", { name: "Delete hello" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText('Deleted "hello".')).toBeTruthy();
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/dictionary/saved/hello")).toBe(true);
  });
});

describe("dictionary settings", () => {
  const system = { maxSavedWords: 100, allowExportDeck: true, allowExportLink: true, englishEnabled: true, englishViEnabled: true };
  const user = { englishEnabled: true, englishViEnabled: true, defaultDictionary: "DICTIONARY_ENGLISH", deckName: "", maxLookupWords: 20 };
  const withSettings =
    (mine: Record<string, unknown>, sys: Record<string, unknown>, rest: (c: Call) => { status?: number; body: unknown } | undefined = () => undefined) =>
    (c: Call) =>
      c.path === "/api/dictionary/me/settings" && c.method === "GET" ? { body: { user: { ...user, ...mine }, system: { ...system, ...sys } } } : rest(c);
  const saved = {
    words: [{ word: "hello", content: "<b>hi</b>", audioUk: "", audioUs: "", createdAt: "2026-11-23T05:00:00Z" }],
    nextPageToken: "",
    total: 1,
  };

  it("hides the dictionary the administrator turned off", async () => {
    setup(["dictionary:word:read"], withSettings({}, { englishViEnabled: false }));
    await screen.findByLabelText("Words");
    await waitFor(() => expect(screen.queryByRole("tab")).toBeNull());
  });

  it("starts with the default dictionary of the user", async () => {
    const calls = setup(
      ["dictionary:word:read"],
      withSettings({ defaultDictionary: "DICTIONARY_ENGLISH_VIETNAMESE" }, {}, (c) => (c.path.startsWith("/api/dictionary/words/") ? { body: { word } } : undefined)),
    );
    const u = userEvent.setup();
    const tab = await screen.findByRole("tab", { name: "English - Vietnamese" });
    await waitFor(() => expect(tab.getAttribute("aria-selected")).toBe("true"));
    await u.type(screen.getByLabelText("Words"), "hello");
    await u.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText("used as a greeting");
    expect(calls.some((c) => c.path === "/api/dictionary/words/hello?dictionary=DICTIONARY_ENGLISH_VIETNAMESE")).toBe(true);
  });

  it("limits the words of a lookup to the preference", async () => {
    const calls = setup(["dictionary:word:read"], withSettings({ maxLookupWords: 2 }, {}));
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
      withSettings({ deckName: "Mine" }, { allowExportLink: false, maxSavedWords: 5 }, (c) => {
        if (c.path.startsWith("/api/dictionary/saved") && c.method === "GET") return { body: saved };
        if (c.path === "/api/dictionary/export") return { body: { filename: "Mine.apkg", data: "", wordCount: 1 } };
        return undefined;
      }),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    expect(await screen.findByText(/1 of 5 saved words/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Export as link" })).toBeNull();
    await u.click(screen.getByRole("button", { name: "Export Anki deck" }));
    await waitFor(() => expect(calls.find((c) => c.path === "/api/dictionary/export")?.body).toEqual({ deckName: "Mine" }));
  });

  it("hides every export when both are off", async () => {
    setup(
      ["dictionary:word:*"],
      withSettings({}, { allowExportDeck: false, allowExportLink: false }, (c) => (c.path.startsWith("/api/dictionary/saved") ? { body: saved } : undefined)),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    await screen.findByText("hello");
    expect(screen.queryByRole("button", { name: "Export Anki deck" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export as link" })).toBeNull();
  });

  it("explains a feature the service refuses", async () => {
    setup(
      ["dictionary:word:*"],
      withSettings({}, {}, (c) => {
        if (c.path.startsWith("/api/dictionary/saved") && c.method === "GET") return { body: saved };
        if (c.path === "/api/dictionary/export") return { status: 400, body: { error: { code: "bad_request", message: "FEATURE_DISABLED: this export is turned off" } } };
        return undefined;
      }),
    );
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-saved"));
    await screen.findByText("hello");
    await u.click(screen.getByRole("button", { name: "Export Anki deck" }));
    expect(await screen.findByText("An administrator turned this off.")).toBeTruthy();
  });

  it("shows the Settings page with the dictionary the administrator turned off disabled, and saves the preferences", async () => {
    const calls = setup(["dictionary:word:read"], withSettings({ maxLookupWords: 7 }, { englishViEnabled: false }, (c) => (c.method === "PUT" ? { body: { user: { ...user, deckName: "Mine", maxLookupWords: 5 }, system: { ...system, englishViEnabled: false } } } : undefined)));
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-settings"));
    const vi = await screen.findByRole("switch", { name: "English - Vietnamese" });
    expect((vi as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Turned off by an administrator.")).toBeTruthy();
    const max = screen.getByLabelText("Words per lookup");
    await waitFor(() => expect((max as HTMLInputElement).value).toBe("7"));
    await u.clear(max);
    await u.type(max, "5");
    await u.type(screen.getByLabelText("Default deck name"), "Mine");
    await u.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ user: { ...user, englishViEnabled: true, deckName: "Mine", maxLookupWords: 5 } }));
    expect(await screen.findByText("Settings saved.")).toBeTruthy();
  });

  it("keeps the default on a dictionary that is on and needs one dictionary", async () => {
    setup(["dictionary:word:read"], withSettings({}, {}));
    const u = userEvent.setup();
    await u.click(await screen.findByTestId("nav-settings"));
    await u.click(await screen.findByRole("switch", { name: "English" }));
    // English is off now, so the default moved to English - Vietnamese
    expect(screen.getByRole("radio", { name: "English - Vietnamese" }).getAttribute("aria-checked")).toBe("true");
    await u.click(screen.getByRole("switch", { name: "English - Vietnamese" }));
    expect(screen.getByText("Keep at least one dictionary on.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves every shown entry with Save all", async () => {
    const calls = setup(["dictionary:word:*"], withSettings({}, {}, (c) => {
      if (c.path === "/api/dictionary/lookup") return { body: { words: [word, { ...word, text: "world" }], notFound: [] } };
      if (c.path.startsWith("/api/dictionary/words/")) return { body: { word } };
      if (c.method === "POST" && c.path === "/api/dictionary/saved") return { body: { savedCount: 1 } };
      return undefined;
    }));
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Words"), "hello, world");
    await u.click(screen.getByRole("button", { name: "Look up" }));
    await u.click(await screen.findByRole("button", { name: "Save all" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST" && c.path === "/api/dictionary/saved")).toHaveLength(2));
  });
});
