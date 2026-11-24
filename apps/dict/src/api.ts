import { useAuth } from "@huponx/auth-client";
import { useMemo } from "react";
import { downscaleImage } from "./lib/image";

/** Source of a lookup: the enum `dictionary.v1.Dictionary` as the gateway writes it (protojson). */
export type Dictionary = "DICTIONARY_ENGLISH" | "DICTIONARY_ENGLISH_VIETNAMESE";

export interface Meaning {
  definition: string;
  examples: string[];
  machineTranslated: boolean;
}

export interface Word {
  text: string;
  phonetic: string;
  phoneticUk: string;
  phoneticUs: string;
  audioUk: string;
  audioUs: string;
  partOfSpeech: string[];
  meanings: Meaning[];
}

export interface SavedWord {
  word: string;
  /** The card back (HTML). */
  content: string;
  audioUk: string;
  audioUs: string;
  /** RFC 3339. */
  createdAt: string;
  /** Packed in a deck. The word is still in the list because remove after export is off. */
  exported?: boolean;
}

/** Event on window: the list of saved words changed somewhere else, the lists read it again. */
export const SAVED_CHANGED = "dict:saved-changed";

/** Which words an export packs: the ones never exported, or the whole list. */
export type ExportScope = "EXPORT_SCOPE_NEW" | "EXPORT_SCOPE_ALL";

export interface DeckLink {
  token: string;
  filename: string;
  wordCount: number;
  /** RFC 3339. */
  expiresAt: string;
}

export interface SavedPage {
  words: SavedWord[];
  nextPageToken: string;
  /** Words in the list of the user, all pages, the exported ones too. */
  total: number;
  /** How many of them are new (never exported). The gateway always writes it; a missing value (an older service) means all are new. */
  newTotal?: number;
}

export interface Exported {
  filename: string;
  /** The .apkg, base64. */
  data: string;
  wordCount: number;
}

/** Settings of the whole system, set by an administrator (the service enforces them). */
export interface SystemSettings {
  maxSavedWords: number;
  allowExportDeck: boolean;
  allowExportLink: boolean;
  englishEnabled: boolean;
  englishViEnabled: boolean;
  /** An export takes the words out of the list (a user can turn it off for themself). */
  removeAfterExport: boolean;
}

/** Preferences of the signed in user (they only narrow the system settings). */
export interface UserSettings {
  englishEnabled: boolean;
  englishViEnabled: boolean;
  defaultDictionary: Dictionary;
  /** Empty: the built-in name. */
  deckName: string;
  /** Words per lookup, 1 to 20. */
  maxLookupWords: number;
  /** An export takes the words out of the list. In effect only when the system allows it too. */
  removeAfterExport: boolean;
  /** The user answered what to do with the exported words that were in the list when remove came on. */
  removeAcknowledged: boolean;
  /** Every export is a new deck for Anki (importing it again adds the cards again). Off: Anki updates the cards. */
  freshDeck: boolean;
}

export interface MySettings {
  user: UserSettings;
  system: SystemSettings;
}

/** The limits of the service, used until the settings are loaded or when they cannot be. */
export const MAX_LOOKUP_WORDS = 20;
export const DEFAULT_MAX_SAVED = 100;
export const DEFAULT_DECK = "My Words";

export const DEFAULT_SYSTEM: SystemSettings = {
  maxSavedWords: DEFAULT_MAX_SAVED,
  allowExportDeck: true,
  allowExportLink: true,
  englishEnabled: true,
  englishViEnabled: true,
  removeAfterExport: true,
};

export const DEFAULT_USER: UserSettings = {
  englishEnabled: true,
  englishViEnabled: true,
  defaultDictionary: "DICTIONARY_ENGLISH",
  deckName: "",
  maxLookupWords: MAX_LOOKUP_WORDS,
  removeAfterExport: true,
  // the defaults stand in for settings that could not be read: do not ask the user anything on them
  removeAcknowledged: true,
  freshDeck: false,
};

/** Remove after export is in effect: the system allows it and the user did not turn it off. */
export function removesAfterExport(s: MySettings): boolean {
  return s.system.removeAfterExport && s.user.removeAfterExport;
}

/**
 * Reads an answer of the gateway. protojson leaves out the fields that are false, zero or empty, so a missing
 * value of a flag is false and a missing number or name is the default; an empty answer is all defaults.
 */
export function parseSettings(
  raw:
    | { user?: Partial<UserSettings>; system?: Partial<SystemSettings> }
    | undefined,
): MySettings {
  const u = raw?.user;
  const s = raw?.system;
  const system: SystemSettings = s
    ? {
        maxSavedWords: s.maxSavedWords || DEFAULT_MAX_SAVED,
        allowExportDeck: s.allowExportDeck ?? false,
        allowExportLink: s.allowExportLink ?? false,
        englishEnabled: s.englishEnabled ?? false,
        englishViEnabled: s.englishViEnabled ?? false,
        removeAfterExport: s.removeAfterExport ?? false,
      }
    : DEFAULT_SYSTEM;
  const user: UserSettings = u
    ? {
        englishEnabled: u.englishEnabled ?? false,
        englishViEnabled: u.englishViEnabled ?? false,
        defaultDictionary:
          u.defaultDictionary === "DICTIONARY_ENGLISH_VIETNAMESE"
            ? "DICTIONARY_ENGLISH_VIETNAMESE"
            : "DICTIONARY_ENGLISH",
        deckName: u.deckName ?? "",
        maxLookupWords: u.maxLookupWords || MAX_LOOKUP_WORDS,
        removeAfterExport: u.removeAfterExport ?? false,
        removeAcknowledged: u.removeAcknowledged ?? false,
        freshDeck: u.freshDeck ?? false,
      }
    : DEFAULT_USER;
  return { user, system };
}

/** The dictionaries the user may use now: on for the system and for the user, English first. */
export function enabledDictionaries(s: MySettings): Dictionary[] {
  const out: Dictionary[] = [];
  if (s.system.englishEnabled && s.user.englishEnabled)
    out.push("DICTIONARY_ENGLISH");
  if (s.system.englishViEnabled && s.user.englishViEnabled)
    out.push("DICTIONARY_ENGLISH_VIETNAMESE");
  return out.length > 0 ? out : ["DICTIONARY_ENGLISH"];
}

/** The dictionary a new lookup starts with: the default of the user when it is on, else the first that is. */
export function startDictionary(s: MySettings): Dictionary {
  const on = enabledDictionaries(s);
  return on.includes(s.user.defaultDictionary)
    ? s.user.defaultDictionary
    : on[0]!;
}

/** Codes the service puts at the start of an error message (`dictionary/internal/service`). */
export type ServiceCode =
  | "MAX_SAVED_WORDS_REACHED"
  | "NO_WORDS_TO_EXPORT"
  | "EXPORT_TOO_LARGE"
  | "FEATURE_DISABLED"
  | "DICTIONARY_DISABLED"
  | "IMAGE_TOO_LARGE"
  | "IMAGE_UNSUPPORTED"
  | "IMAGE_QUOTA_EXCEEDED"
  | "IMAGES_DISABLED";

const SERVICE_CODES: ServiceCode[] = [
  "MAX_SAVED_WORDS_REACHED",
  "NO_WORDS_TO_EXPORT",
  "EXPORT_TOO_LARGE",
  "FEATURE_DISABLED",
  "DICTIONARY_DISABLED",
  "IMAGE_TOO_LARGE",
  "IMAGE_UNSUPPORTED",
  "IMAGE_QUOTA_EXCEEDED",
  "IMAGES_DISABLED",
];

/** The service code an error carries, if any (its message starts with it). */
export function serviceCode(e: unknown): ServiceCode | undefined {
  if (!(e instanceof Error)) return undefined;
  return SERVICE_CODES.find((c) => e.message.startsWith(c));
}

/** Splits what the user typed (commas, semicolons, new lines) into distinct words, in order. */
export function parseWords(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(/[,;\n]/)) {
    const w = part.trim().replace(/\s+/g, " ");
    const key = w.toLowerCase();
    if (!w || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

/** Decodes base64 and offers the bytes as a download. */
export function downloadBase64(data: string, filename: string): void {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/octet-stream" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Images of the cards by id: the answer is read once, and its blob URL is made once (until the page goes). */
const imageBlobs = new Map<string, Promise<Blob>>();
const imageUrls = new Map<string, string>();

/** Forgets the images read so far (for the tests). */
export function clearImageCache(): void {
  imageBlobs.clear();
  imageUrls.clear();
}

function base64Blob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function loadImage(client: ReturnType<typeof useAuth>["client"], id: string): Promise<Blob> {
  let p = imageBlobs.get(id);
  if (!p) {
    p = client
      .api<{ contentType: string; data: string }>("GET", `/api/dictionary/images/${encodeURIComponent(id)}`)
      .then((r) => base64Blob(r.data, r.contentType));
    p.catch(() => imageBlobs.delete(id)); // a failure is not remembered
    imageBlobs.set(id, p);
  }
  return p;
}

/** The calls of the dictionary service through the gateway (`/api/dictionary/...`). */
export function useDictionary() {
  const { client } = useAuth();
  return useMemo(
    () => ({
      lookup: (word: string, dictionary: Dictionary) =>
        client
          .api<{ word: Word }>(
            "GET",
            `/api/dictionary/words/${encodeURIComponent(word)}?dictionary=${dictionary}`,
          )
          .then((r) => r.word),
      lookupMany: (words: string[], dictionary: Dictionary) =>
        client.api<{ words: Word[]; notFound: string[] }>(
          "POST",
          "/api/dictionary/lookup",
          { words, dictionary },
        ),
      save: (w: {
        word: string;
        content: string;
        audioUk: string;
        audioUs: string;
      }) =>
        client.api<{ savedCount: number }>("POST", "/api/dictionary/saved", w),
      /** Shrinks the picture (see lib/image.ts), stores it in the service and returns its id (card reference `dictimg:<id>`). */
      uploadImage: async (file: Blob) => {
        const p = await downscaleImage(file);
        const r = await client.api<{ id: string }>("POST", "/api/dictionary/images", p);
        return r.id;
      },
      /** The picture of an id as a Blob (JSON with base64 on the wire: an <img> cannot carry the token). */
      getImage: (id: string) => loadImage(client, id),
      /** A blob: URL of the picture, to put in an <img>. */
      imageUrl: async (id: string): Promise<string> => {
        const known = imageUrls.get(id);
        if (known) return known;
        const blob = await loadImage(client, id);
        const url = imageUrls.get(id) ?? URL.createObjectURL(blob);
        imageUrls.set(id, url);
        return url;
      },
      list: (pageToken?: string, query?: string) =>
        client.api<SavedPage>(
          "GET",
          `/api/dictionary/saved?pageSize=50${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}${query ? `&query=${encodeURIComponent(query)}` : ""}`,
        ),
      /**
       * All words of the list (at most the limit of the service): pages of 50 until the last one. A query keeps the
       * words that contain it (the service matches, ignoring case); the totals still count the whole list.
       */
      listAll: async (query?: string) => {
        const words: SavedWord[] = [];
        let token: string | undefined;
        let total = 0;
        let newTotal = 0;
        do {
          const p: SavedPage = await client.api<SavedPage>(
            "GET",
            `/api/dictionary/saved?pageSize=50${token ? `&pageToken=${encodeURIComponent(token)}` : ""}${query ? `&query=${encodeURIComponent(query)}` : ""}`,
          );
          words.push(...p.words);
          total = p.total;
          newTotal = p.newTotal ?? p.total;
          token = p.nextPageToken || undefined;
        } while (token);
        return { words, total, newTotal };
      },
      remove: (word: string) =>
        client.api<unknown>(
          "DELETE",
          `/api/dictionary/saved/${encodeURIComponent(word)}`,
        ),
      /** Keeps the deck behind a link an Anki app can import (works once, a few minutes); returns the URL too. */
      exportLink: async (
        deckName: string,
        scope: ExportScope = "EXPORT_SCOPE_NEW",
      ) => {
        const l = await client.api<DeckLink>(
          "POST",
          "/api/dictionary/export-link",
          { deckName, scope },
        );
        return {
          ...l,
          url: `${client.apiBase}/api/dictionary/downloads/${encodeURIComponent(l.token)}.apkg`,
        };
      },
      getSettings: () =>
        client
          .api<Parameters<typeof parseSettings>[0]>(
            "GET",
            "/api/dictionary/me/settings",
          )
          .then(parseSettings),
      saveSettings: (user: UserSettings) =>
        client
          .api<Parameters<typeof parseSettings>[0]>(
            "PUT",
            "/api/dictionary/me/settings",
            { user },
          )
          .then(parseSettings),
      exportAnki: (deckName: string, scope: ExportScope = "EXPORT_SCOPE_NEW") =>
        client.api<Exported>("POST", "/api/dictionary/export", {
          deckName,
          scope,
        }),
      /** Takes the exported words out of the list (the new ones stay); returns how many left. */
      removeExportedWords: () =>
        client
          .api<{ removed?: number }>(
            "POST",
            "/api/dictionary/saved-words/remove-exported",
            {},
          )
          .then((r) => r.removed ?? 0),
    }),
    [client],
  );
}
