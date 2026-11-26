import { ApiError, useAuth } from "@huponx/auth-client";
import { useMemo } from "react";
import { audioId, readAudio } from "./lib/audio";
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
  /** Ids of the categories of the word (protojson leaves the field out when there are none). */
  categoryIds?: string[];
  /** RFC 3339: when the word is due for its next review. Left out for a new word (never reviewed). */
  nextReviewAt?: string;
  /** In a learning step (protojson leaves the field out when false). */
  learning?: boolean;
}

/** A category of saved words; a word may be in several. protojson leaves out zero counts. */
export interface Category {
  id: string;
  name: string;
  /** Words of the list in the category, and how many of them are new (never exported). */
  total?: number;
  newTotal?: number;
}

export interface CategoryList {
  categories: Category[];
  /** Words in no category (total, new): the "Uncategorized" filter. */
  uncategorizedTotal?: number;
  uncategorizedNewTotal?: number;
  /** A count stopped at its cap (10000) and is a lower bound: show "10000+". */
  countsCapped?: boolean;
}

/** The longest category name until the service says otherwise (an administrator sets it). */
export const DEFAULT_MAX_CATEGORY_NAME = 40;
export const DEFAULT_MAX_CATEGORIES = 50;

/** The value of a category filter that stands for the words in no category; "" stands for every word. */
export const UNCATEGORIZED = "none";

/** What a request sends for a category filter value ("" = all, UNCATEGORIZED, or a category id). */
export interface CategoryFilterParams {
  categoryId?: string;
  uncategorized?: boolean;
}

export function filterParams(value: string): CategoryFilterParams {
  if (value === UNCATEGORIZED) return { uncategorized: true };
  return value ? { categoryId: value } : {};
}

function filterQuery(f: CategoryFilterParams): string {
  // a query string reaches the service as text, which a bool field refuses: the id stands for it
  if (f.uncategorized) return "&categoryId=uncategorized";
  return f.categoryId ? `&categoryId=${encodeURIComponent(f.categoryId)}` : "";
}

/** A card of the review: the front is the word, the back the card (HTML) like a saved word. */
export interface ReviewCard {
  word: string;
  content: string;
  audioUk: string;
  audioUs: string;
  isNew: boolean;
  /** Being learned (after Again or Hard); never together with `isNew`. */
  learning: boolean;
  /** Seconds until the next review after Again, Hard, Good and Easy. */
  gradeIntervalsSeconds: number[];
}

export interface ReviewQueue {
  cards: ReviewCard[];
  /** Review cards (not in learning) due now, new cards still allowed today and cards in learning due now (before
   * the cut to the limit of the request). */
  dueCount: number;
  learningCount: number;
  newCount: number;
  /** Words in the list. */
  totalCount: number;
  /** RFC 3339; the next card that is not due yet. Undefined: none. */
  nextDueAt?: string;
  /** New words, and due plus learning cards, left but held back by the daily limits (with the bonus). */
  newHeld: number;
  dueHeld: number;
  /** A count stopped at its cap (10000) and is a lower bound: show "10000+". */
  countsCapped: boolean;
}

/** Counts of the queue stop here; above it the numbers say "10000+". */
export const REVIEW_COUNT_CAP = 10000;

/**
 * The counts of one category stop here (`categoryCountCap` in `dictionary/internal/store`): a lookup per word, and the
 * page of the categories counts every one of them. The other counts stop at REVIEW_COUNT_CAP.
 */
export const CATEGORY_COUNT_CAP = 1000;

/** A count for the screen: "10000+" (or "1000+" with the cap of a category) when it reached the cap. */
export function formatCount(
  n: number,
  capped: boolean,
  cap = REVIEW_COUNT_CAP,
): string {
  return capped && n >= cap ? `${cap}+` : String(n);
}

export type ReviewGrade =
  | "REVIEW_GRADE_AGAIN"
  | "REVIEW_GRADE_HARD"
  | "REVIEW_GRADE_GOOD"
  | "REVIEW_GRADE_EASY";

/** The grades in the order of the buttons (and of `gradeIntervalsSeconds`). */
export const REVIEW_GRADES: ReviewGrade[] = [
  "REVIEW_GRADE_AGAIN",
  "REVIEW_GRADE_HARD",
  "REVIEW_GRADE_GOOD",
  "REVIEW_GRADE_EASY",
];

export interface ReviewResult {
  /** RFC 3339. */
  dueAt: string;
  intervalSeconds: number;
  /** Seconds until the next review after Again, Hard, Good and Easy of the card as it is now; empty from an old service. */
  gradeIntervalsSeconds: number[];
}

/** Result of OptimizeReviewParameters. */
export interface OptimizeResult {
  /** The fitted parameters were stored. */
  applied: boolean;
  reviewCount: number;
  lossDefault: number;
  lossTrained: number;
  /** RFC 3339; empty when never fitted. */
  trainedAt: string;
  /** Why they were not applied. */
  reason: string;
}

/** Reads the queue as protojson writes it: zero counts are missing and int64 are strings. */
function parseQueue(raw: {
  cards?: (Omit<Partial<ReviewCard>, "gradeIntervalsSeconds"> & {
    gradeIntervalsSeconds?: (string | number)[];
  })[];
  dueCount?: number;
  learningCount?: number;
  newCount?: number;
  totalCount?: number;
  nextDueAt?: string;
  newHeld?: number;
  dueHeld?: number;
  countsCapped?: boolean;
}): ReviewQueue {
  return {
    cards: (raw.cards ?? []).map((c) => ({
      word: c.word ?? "",
      content: c.content ?? "",
      audioUk: c.audioUk ?? "",
      audioUs: c.audioUs ?? "",
      isNew: c.isNew ?? false,
      learning: c.learning ?? false,
      gradeIntervalsSeconds: (c.gradeIntervalsSeconds ?? []).map(Number),
    })),
    dueCount: raw.dueCount ?? 0,
    learningCount: raw.learningCount ?? 0,
    newCount: raw.newCount ?? 0,
    totalCount: raw.totalCount ?? 0,
    nextDueAt: raw.nextDueAt || undefined,
    newHeld: raw.newHeld ?? 0,
    dueHeld: raw.dueHeld ?? 0,
    countsCapped: raw.countsCapped ?? false,
  };
}

/** Event on window: the list of saved words changed somewhere else, the lists read it again. */
export const SAVED_CHANGED = "dict:saved-changed";

/** What the user stores of one kind and the limit in effect for the user (the own limit of the user included), in bytes. */
export interface StorageUsage {
  used: number;
  limit: number;
}

export interface MyStorage {
  content: StorageUsage;
  image: StorageUsage;
  audio: StorageUsage;
}

type RawUsage = { used?: string | number; limit?: string | number } | undefined;

/** The gateway writes int64 as a JSON string, and leaves out a 0. */
function parseUsage(r: RawUsage): StorageUsage {
  return { used: Number(r?.used ?? 0), limit: Number(r?.limit ?? 0) };
}

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
  /** newTotal, and total when a category filter is set, stopped at the cap (10000): show "10000+". The unfiltered total is exact. */
  countsCapped?: boolean;
}

export type ExportJobStatus =
  "queued" | "running" | "done" | "failed" | "cancelled";

/** One deck file of an export job (the words of a part are exported when it is made). */
export interface ExportPart {
  n: number;
  filename: string;
  wordCount?: number;
  size?: number;
}

/** An export in parts of a list too long for one deck. protojson leaves out zero counts. */
export interface ExportJob {
  id: string;
  status: ExportJobStatus;
  deckName?: string;
  total?: number;
  built?: number;
  /** Words of the part being built that are done (an estimate, 0 between parts). */
  building?: number;
  parts?: ExportPart[];
  error?: string;
  createdAt: string;
  finishedAt?: string;
  /** RFC 3339: when the parts stop being downloadable. */
  expiresAt: string;
}

/** Words packed so far, counting the part that is being built: what the progress bar shows. */
export function exportProgress(j: ExportJob): number {
  const done = (j.built ?? 0) + (j.building ?? 0);
  return j.total ? Math.min(done, j.total) : done;
}

/** The job is still being made (it needs polling). */
export function exportJobActive(j: ExportJob | undefined): boolean {
  return j?.status === "queued" || j?.status === "running";
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
  /** The largest content (card) of one word, in bytes. */
  maxContentBytes: number;
  /** Categories per user and the longest category name (characters). */
  maxCategories: number;
  maxCategoryNameLength: number;
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
  /** New words the review shows per 24 hours, 0 to 100 (0: none). */
  reviewNewPerDay: number;
  /** Review cards (due and learning) the review shows per 24 hours, 0 to 9999 (0: none). */
  reviewMaxPerDay: number;
  /** Algorithm that schedules the review. */
  reviewAlgorithm: ReviewAlgorithm;
  /** FSRS: the chance (percent, 70 to 97) to remember a card on the day it is due. */
  desiredRetention: number;
}

export type ReviewAlgorithm = "sm2" | "fsrs";

export interface MySettings {
  user: UserSettings;
  system: SystemSettings;
  /** RFC 3339: when the FSRS parameters were last fitted; empty: the defaults. */
  fsrsTrainedAt: string;
  fsrsReviewCount: number;
}

/** The limits of the service, used until the settings are loaded or when they cannot be. */
export const MAX_LOOKUP_WORDS = 20;
export const DEFAULT_MAX_SAVED = 100;
export const DEFAULT_MAX_CONTENT_BYTES = 64 * 1024;
export const DEFAULT_DECK = "My Words";
export const MAX_REVIEW_NEW_PER_DAY = 100;
export const DEFAULT_REVIEW_NEW_PER_DAY = 10;
export const MAX_REVIEW_MAX_PER_DAY = 9999;
export const DEFAULT_REVIEW_MAX_PER_DAY = 200;
export const MIN_DESIRED_RETENTION = 70;
export const MAX_DESIRED_RETENTION = 97;
export const DEFAULT_DESIRED_RETENTION = 90;

export const DEFAULT_SYSTEM: SystemSettings = {
  maxSavedWords: DEFAULT_MAX_SAVED,
  maxContentBytes: DEFAULT_MAX_CONTENT_BYTES,
  maxCategories: DEFAULT_MAX_CATEGORIES,
  maxCategoryNameLength: DEFAULT_MAX_CATEGORY_NAME,
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
  reviewNewPerDay: DEFAULT_REVIEW_NEW_PER_DAY,
  reviewMaxPerDay: DEFAULT_REVIEW_MAX_PER_DAY,
  reviewAlgorithm: "sm2",
  desiredRetention: DEFAULT_DESIRED_RETENTION,
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
    | {
        user?: Partial<UserSettings>;
        system?: Partial<SystemSettings>;
        fsrsTrainedAt?: string;
        fsrsReviewCount?: number;
      }
    | undefined,
): MySettings {
  const u = raw?.user;
  const s = raw?.system;
  const system: SystemSettings = s
    ? {
        maxSavedWords: s.maxSavedWords || DEFAULT_MAX_SAVED,
        maxContentBytes: s.maxContentBytes || DEFAULT_MAX_CONTENT_BYTES,
        maxCategories: s.maxCategories || DEFAULT_MAX_CATEGORIES,
        maxCategoryNameLength:
          s.maxCategoryNameLength || DEFAULT_MAX_CATEGORY_NAME,
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
        // protojson leaves out a 0, which is a choice here (no new words, no review cards)
        reviewNewPerDay: u.reviewNewPerDay ?? 0,
        // the gateway sends a 0 too, so a missing field is a server that does not know it yet: the default
        reviewMaxPerDay: u.reviewMaxPerDay ?? DEFAULT_REVIEW_MAX_PER_DAY,
        // missing: an empty string and a 0, which the service reads as SM-2 and 90
        reviewAlgorithm: u.reviewAlgorithm === "fsrs" ? "fsrs" : "sm2",
        desiredRetention: u.desiredRetention || DEFAULT_DESIRED_RETENTION,
      }
    : DEFAULT_USER;
  return {
    user,
    system,
    fsrsTrainedAt: raw?.fsrsTrainedAt ?? "",
    fsrsReviewCount: raw?.fsrsReviewCount ?? 0,
  };
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

/** The words an export packs: the new or all of the list (of a category, if one is given), or exactly these words. */
export type ExportSource =
  ({ scope: ExportScope } & CategoryFilterParams) | { words: string[] };

/** The query string of the review queue: the limit and the category filter, or nothing. */
function reviewQuery(
  limit: number | undefined,
  f: CategoryFilterParams,
): string {
  const q = `${limit ? `&limit=${limit}` : ""}${filterQuery(f)}`;
  return q ? `?${q.slice(1)}` : "";
}

function exportBody(deckName: string, source: ExportSource) {
  return "words" in source
    ? { deckName, words: source.words }
    : { deckName, ...source };
}

/** Codes the service puts at the start of an error message (`dictionary/internal/service`). */
export type ServiceCode =
  | "MAX_SAVED_WORDS_REACHED"
  | "SAVED_BYTES_EXCEEDED"
  | "NO_WORDS_TO_EXPORT"
  | "EXPORT_TOO_LARGE"
  | "EXPORT_USE_JOB"
  | "EXPORT_JOB_ACTIVE"
  | "EXPORT_JOBS_DISABLED"
  | "FEATURE_DISABLED"
  | "DICTIONARY_DISABLED"
  | "IMAGE_TOO_LARGE"
  | "IMAGE_UNSUPPORTED"
  | "IMAGE_QUOTA_EXCEEDED"
  | "IMAGES_DISABLED"
  | "AUDIO_TOO_LARGE"
  | "AUDIO_UNSUPPORTED"
  | "AUDIO_QUOTA_EXCEEDED"
  | "AUDIO_DISABLED"
  | "AUDIO_NOT_FOUND"
  | "CATEGORY_LIMIT_REACHED"
  | "CATEGORY_EXISTS";

const SERVICE_CODES: ServiceCode[] = [
  "MAX_SAVED_WORDS_REACHED",
  "SAVED_BYTES_EXCEEDED",
  "NO_WORDS_TO_EXPORT",
  "EXPORT_TOO_LARGE",
  "EXPORT_USE_JOB",
  "EXPORT_JOB_ACTIVE",
  "EXPORT_JOBS_DISABLED",
  "FEATURE_DISABLED",
  "DICTIONARY_DISABLED",
  "IMAGE_TOO_LARGE",
  "IMAGE_UNSUPPORTED",
  "IMAGE_QUOTA_EXCEEDED",
  "IMAGES_DISABLED",
  "AUDIO_TOO_LARGE",
  "AUDIO_UNSUPPORTED",
  "AUDIO_QUOTA_EXCEEDED",
  "AUDIO_DISABLED",
  "AUDIO_NOT_FOUND",
  "CATEGORY_LIMIT_REACHED",
  "CATEGORY_EXISTS",
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

/** The same for the uploaded audio files. */
const audioBlobs = new Map<string, Promise<Blob>>();
const audioUrls = new Map<string, string>();

/** Forgets the images and the audio files read so far (for the tests). */
export function clearImageCache(): void {
  imageBlobs.clear();
  imageUrls.clear();
  audioBlobs.clear();
  audioUrls.clear();
}

function base64Blob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function loadImage(
  client: ReturnType<typeof useAuth>["client"],
  id: string,
): Promise<Blob> {
  let p = imageBlobs.get(id);
  if (!p) {
    p = client
      .api<{ contentType: string; data: string }>(
        "GET",
        `/api/dictionary/images/${encodeURIComponent(id)}`,
      )
      .then((r) => base64Blob(r.data, r.contentType));
    p.catch(() => imageBlobs.delete(id)); // a failure is not remembered
    imageBlobs.set(id, p);
  }
  return p;
}

function loadAudio(
  client: ReturnType<typeof useAuth>["client"],
  id: string,
): Promise<Blob> {
  let p = audioBlobs.get(id);
  if (!p) {
    p = client
      .api<{ contentType: string; data: string }>(
        "GET",
        `/api/dictionary/audio/${encodeURIComponent(id)}`,
      )
      .then((r) => base64Blob(r.data, r.contentType));
    p.catch(() => audioBlobs.delete(id)); // a failure is not remembered
    audioBlobs.set(id, p);
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
        /** Categories to add the word to (the ones it has stay). */
        categoryIds?: string[];
      }) =>
        client.api<{ savedCount: number }>("POST", "/api/dictionary/saved", w),
      listCategories: () =>
        client.api<CategoryList>("GET", "/api/dictionary/categories"),
      createCategory: (name: string) =>
        client
          .api<{ category: Category }>("POST", "/api/dictionary/categories", {
            name,
          })
          .then((r) => r.category),
      renameCategory: (id: string, name: string) =>
        client
          .api<{ category: Category }>(
            "PATCH",
            `/api/dictionary/categories/${encodeURIComponent(id)}`,
            { name },
          )
          .then((r) => r.category),
      /** Deletes the category only; its words stay in the list. */
      deleteCategory: (id: string) =>
        client.api<unknown>(
          "DELETE",
          `/api/dictionary/categories/${encodeURIComponent(id)}`,
        ),
      /** Adds the words to some categories and takes them out of others; the card and the exported flag stay. */
      updateWordCategories: (
        words: string[],
        addCategoryIds: string[],
        removeCategoryIds: string[],
      ) =>
        client.api<{ updated?: number }>(
          "POST",
          "/api/dictionary/saved-words/categories",
          {
            words,
            addCategoryIds,
            removeCategoryIds,
          },
        ),
      /** Shrinks the picture (see lib/image.ts), stores it in the service and returns its id (card reference `dictimg:<id>`). */
      uploadImage: async (file: Blob) => {
        const p = await downscaleImage(file);
        const r = await client.api<{ id: string }>(
          "POST",
          "/api/dictionary/images",
          p,
        );
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
      /** Checks the file (see lib/audio.ts), stores it in the service and returns its id (card reference `dictaud:<id>`). */
      uploadAudio: async (file: File) => {
        const p = await readAudio(file);
        const r = await client.api<{ id: string }>(
          "POST",
          "/api/dictionary/audio",
          p,
        );
        return r.id;
      },
      /** A blob: URL of the uploaded file of a reference (`dictaud:<id>`), to give to an Audio. */
      audioUrl: async (ref: string): Promise<string> => {
        const id = audioId(ref);
        const known = audioUrls.get(id);
        if (known) return known;
        const blob = await loadAudio(client, id);
        const url = audioUrls.get(id) ?? URL.createObjectURL(blob);
        audioUrls.set(id, url);
        return url;
      },
      list: (
        pageToken?: string,
        query?: string,
        pageSize = 50,
        filter: CategoryFilterParams = {},
      ) =>
        client.api<SavedPage>(
          "GET",
          `/api/dictionary/saved?pageSize=${pageSize}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}${query ? `&query=${encodeURIComponent(query)}` : ""}${filterQuery(filter)}`,
        ),
      /** Which of the words (at most 100) are in the list, with the ids of their categories. */
      checkSaved: (words: string[]) =>
        client
          .api<{ words?: { word: string; categoryIds?: string[] }[] }>(
            "POST",
            "/api/dictionary/saved/check",
            { words },
          )
          .then((r) => r.words ?? []),
      remove: (word: string) =>
        client.api<unknown>(
          "DELETE",
          `/api/dictionary/saved/${encodeURIComponent(word)}`,
        ),
      /** Starts an export in parts (`EXPORT_USE_JOB`): the words of a category, or all/new words. */
      startExport: (deckName: string, source: ExportSource) =>
        client
          .api<{ job: ExportJob }>(
            "POST",
            "/api/dictionary/exports",
            exportBody(deckName, source),
          )
          .then((r) => r.job),
      /** A job, or the one started last ("latest"); undefined when the user has none. */
      getExport: (id = "latest") =>
        client
          .api<{ job: ExportJob }>(
            "GET",
            `/api/dictionary/exports/${encodeURIComponent(id)}`,
          )
          .then((r) => r.job)
          .catch((e: unknown) => {
            if (e instanceof ApiError && e.status === 404) return undefined;
            throw e;
          }),
      cancelExport: (id: string) =>
        client
          .api<{ job: ExportJob }>(
            "POST",
            `/api/dictionary/exports/${encodeURIComponent(id)}/cancel`,
            {},
          )
          .then((r) => r.job),
      /** The link of a part: it can be opened many times until the job expires. */
      exportPartLink: async (id: string, n: number) => {
        const l = await client.api<DeckLink>(
          "POST",
          `/api/dictionary/exports/${encodeURIComponent(id)}/parts/${n}/link`,
          {},
        );
        return {
          ...l,
          // streamed by the gateway, so a part can be larger than a message
          url: `${client.apiBase}/api/dictionary/export-downloads/${encodeURIComponent(l.token)}.apkg`,
        };
      },
      /** Keeps the deck behind a link an Anki app can import (works once, a few minutes); returns the URL too. */
      exportLink: async (
        deckName: string,
        source: ExportSource = { scope: "EXPORT_SCOPE_NEW" },
      ) => {
        const l = await client.api<DeckLink>(
          "POST",
          "/api/dictionary/export-link",
          exportBody(deckName, source),
        );
        return {
          ...l,
          url: `${client.apiBase}/api/dictionary/downloads/${encodeURIComponent(l.token)}.apkg`,
        };
      },
      /** The cards to review now: the due ones first, then new words up to the daily limit of the user. */
      getReviewQueue: (limit?: number, filter: CategoryFilterParams = {}) =>
        client
          .api<Parameters<typeof parseQueue>[0]>(
            "GET",
            `/api/dictionary/review${reviewQuery(limit, filter)}`,
          )
          .then(parseQueue),
      /** Grades a card; the service schedules the next review. */
      submitReview: (word: string, grade: ReviewGrade) =>
        client
          .api<{
            dueAt: string;
            intervalSeconds?: string | number;
            gradeIntervalsSeconds?: (string | number)[];
          }>("POST", "/api/dictionary/review", { word, grade })
          .then((r): ReviewResult => ({
            dueAt: r.dueAt,
            intervalSeconds: Number(r.intervalSeconds ?? 0),
            gradeIntervalsSeconds: (r.gradeIntervalsSeconds ?? []).map(Number),
          })),
      /** Fits the FSRS parameters to the review history of the user (`restoreDefaults`: forgets them instead). */
      optimizeReview: (restoreDefaults = false) =>
        client
          .api<Partial<OptimizeResult>>(
            "POST",
            "/api/dictionary/review/optimize",
            { restoreDefaults },
          )
          .then((r): OptimizeResult => ({
            applied: r.applied ?? false,
            reviewCount: r.reviewCount ?? 0,
            lossDefault: r.lossDefault ?? 0,
            lossTrained: r.lossTrained ?? 0,
            trainedAt: r.trainedAt ?? "",
            reason: r.reason ?? "",
          })),
      /** Raises today's limits of the review for 24 hours (the settings stay); each number 0 to 9999, one above 0. */
      addReviewBonus: (newWords: number, reviews: number) =>
        client.api<unknown>("POST", "/api/dictionary/review/bonus", {
          newWords,
          reviews,
        }),
      getSettings: () =>
        client
          .api<Parameters<typeof parseSettings>[0]>(
            "GET",
            "/api/dictionary/me/settings",
          )
          .then(parseSettings),
      getMyStorage: () =>
        client
          .api<{ content?: RawUsage; image?: RawUsage; audio?: RawUsage }>(
            "GET",
            "/api/dictionary/me/storage",
          )
          .then(
            (r): MyStorage => ({
              content: parseUsage(r.content),
              image: parseUsage(r.image),
              audio: parseUsage(r.audio),
            }),
          ),
      saveSettings: (user: UserSettings) =>
        client
          .api<Parameters<typeof parseSettings>[0]>(
            "PUT",
            "/api/dictionary/me/settings",
            { user },
          )
          .then(parseSettings),
      exportAnki: (
        deckName: string,
        source: ExportSource = { scope: "EXPORT_SCOPE_NEW" },
      ) =>
        client.api<Exported>(
          "POST",
          "/api/dictionary/export",
          exportBody(deckName, source),
        ),
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
