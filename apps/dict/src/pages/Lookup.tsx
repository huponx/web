import { ApiError, P, useAuth } from "@huponx/auth-client";
import { Alert, AutoAlert, Button, Card, CardContent, ClearButton, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, iconTone, Input, Label, NOTICE_MS, Tabs, TabsList, TabsTrigger, Textarea } from "@huponx/ui-kit";
import {
  Check,
  Copy,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  Search,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useBlocker } from "react-router-dom";
import {
  cardsHtml,
  cardsText,
  cardText,
  combinedCardBack,
  copyRich,
  escapeHtml,
  renderPart,
} from "../anki";
import type { CardPart } from "../anki";
import { parseWords, serviceCode, useDictionary } from "../api";
import type { Category, Word } from "../api";
import { GroupSwitcher } from "../GroupSwitcher";
import {
  notifySavedChanged,
  readLookupCategories,
  useCategories,
  writeLookupCategories,
} from "../lib/categories";
import { errorMessage, Localized } from "../lib/errors";
import { dictionaryLabel, useRegistry } from "../lib/registry";
import { useSettings } from "../lib/settings";
import { useCopied } from "../lib/useCopied";
import { CategoryPicker } from "./CategoryPicker";
import { SavedList } from "./Saved";
import { WordCard } from "./WordCard";
import type { CardOverride } from "./WordCard";

/** `text` is an error or a `Localized`, translated when shown (WordCard), so the notice follows the language. */
type Notice = { kind: "success" | "error"; text: unknown };

const key = (w: string) => w.trim().toLowerCase();

/** The most words one check asks about (the service takes 100). */
const MAX_CHECK_WORDS = 100;

/** The saved words after a check of `names`: the ones found with their categories, the others not saved. */
function withChecked(
  m: Map<string, string[]>,
  names: string[],
  found: { word: string; categoryIds?: string[] }[],
) {
  const next = new Map(m);
  for (const n of names) next.delete(key(n));
  for (const f of found) next.set(key(f.word), f.categoryIds ?? []);
  return next;
}

/** The error key of a word typed for a card made by hand, mirroring the rules of the service (NormalizeWord); none when it is fine. */
const MAX_WORD_RUNES = 64;
function wordProblem(
  raw: string,
): "manual.empty" | "manual.tooLong" | "manual.invalid" | undefined {
  const w = raw.trim().replace(/\s+/g, " ");
  if (w === "") return "manual.empty";
  if (Array.from(w).length > MAX_WORD_RUNES) return "manual.tooLong";
  if (!/^[\p{L}\p{N} '.-]+$/u.test(w)) return "manual.invalid";
  return undefined;
}

/** The edits of the user, by word and by dictionary id. */
type Edits = Record<string, Record<string, CardOverride>>;

/** A word with nothing in it: stands for a word that has an edit but no entry (yet) in the shown dictionary. */
const blank = (text: string): Word => ({
  text,
  phonetic: "",
  phoneticUk: "",
  phoneticUs: "",
  audioUk: "",
  audioUs: "",
  partOfSpeech: [],
  meanings: [],
});

/** What the lookup page shows: kept while the user visits another page, so coming back finds it as it was. */
interface Memo {
  input: string;
  /** What the user picked; none yet: the default of the settings. */
  dictionary: string | undefined;
  words: Word[];
  /** The words of the last lookup, as typed. */
  searchedList: string[];
  shownDict: string;
  notFound: string[];
  searched: boolean;
  /** The edits and the entries fetched: they live as long as the lookup does. */
  overrides: Edits;
  unsaved: Set<string>;
  entries: Record<string, Record<string, Word>>;
}

const MemoContext = createContext<{ current: Memo } | null>(null);

/** Keeps the lookup state above the routes (in memory only: a reload starts clean). */
export function LookupMemoProvider({ children }: { children: ReactNode }) {
  const memo = useRef<Memo>({
    input: "",
    dictionary: undefined,
    words: [],
    searchedList: [],
    shownDict: "",
    notFound: [],
    searched: false,
    overrides: {},
    unsaved: new Set(),
    entries: {},
  });
  return <MemoContext.Provider value={memo}>{children}</MemoContext.Provider>;
}

/** Lookup page: type words, pick the dictionary, read the entries, save them or copy them as Anki cards. */
export function Lookup() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const api = useDictionary();
  const { settings } = useSettings();
  const fallback = useRef<Memo>({
    input: "",
    dictionary: undefined,
    words: [],
    searchedList: [],
    shownDict: "",
    notFound: [],
    searched: false,
    overrides: {},
    unsaved: new Set(),
    entries: {},
  });
  const memo = useContext(MemoContext) ?? fallback;
  const [input, setInput] = useState(memo.current.input);
  const [picked, setPicked] = useState<string | undefined>(
    memo.current.dictionary,
  );
  const {
    all: registry,
    group,
    dictionaries: groupDicts,
    enabled: isOn,
    loaded: registryLoaded,
  } = useRegistry();
  const enabled = groupDicts.filter((d) => isOn(d.id));
  // the pick of the user while that dictionary is on, else the default of the settings, else the first one that is on
  const dictionary: string =
    (enabled.find((d) => d.id === picked) ??
      enabled.find((d) => d.id === settings.user.defaultDictionary) ??
      enabled[0])?.id ?? "";
  const maxWords = settings.user.maxLookupWords;
  const chosen = useRef(dictionary);
  chosen.current = dictionary;
  const [words, setWords] = useState<Word[]>(memo.current.words);
  // the dictionary the shown entries come from
  const [searchedList, setSearchedList] = useState<string[]>(
    memo.current.searchedList,
  );
  // every entry fetched, by dictionary and word: Save reuses them
  const entries = useRef(memo.current.entries);
  // the last fetch wins when the user changes the tab quickly
  const seq = useRef(0);
  const [shownDict, setShownDict] = useState(memo.current.shownDict);
  const [notFound, setNotFound] = useState<string[]>(memo.current.notFound);
  const [busy, setBusy] = useState(false);
  // words (lower case) whose card is being written by hand, with no entry behind it; dropped when the editor is cancelled
  const [manualKeys, setManualKeys] = useState<Set<string>>(new Set());
  // the dialog of the "New card" button
  const [newOpen, setNewOpen] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [newTried, setNewTried] = useState(false);
  const [copied, markCopied] = useCopied();
  // a lookup was made: changing the dictionary then repeats it at once
  const [searched, setSearched] = useState(memo.current.searched);
  const [saving, setSaving] = useState<string>();
  // the categories of each word: a saved word has them on the service (savedCats), the others start from the last pick
  const { categories, loaded: catsLoaded } = useCategories(group);
  // the default of the cards: only what the user set with "Use as default" (kept in the browser)
  const [defaults, setDefaults] = useState<string[]>(readLookupCategories);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const alive = (ids: string[]) =>
    catsLoaded ? ids.filter((id) => categories.some((c) => c.id === id)) : ids;
  const categoriesOf = (w: Word) =>
    alive(savedCats.get(key(w.text)) ?? drafts[key(w.text)] ?? defaults);
  const [savingAll, setSavingAll] = useState(false);
  const [error, setError] = useState<unknown>();
  // the error came from a lookup that failed (asking again may work), not from what the user typed
  const [retry, setRetry] = useState(false);
  // words already in the saved list (lower case): saving one of them again overwrites it
  // with the ids of their categories
  const [savedCats, setSavedCats] = useState<Map<string, string[]>>(new Map());
  // bumped when the saved list changes (a save here, a delete or export in the panel): both parts read it again
  const [version, setVersion] = useState(0);
  // notice per card, keyed by the word; "" is the one of the page (copy all)
  // the cards the user edited (not saved yet), by word and dictionary; a new lookup drops them
  const [overrides, setOverrides] = useState<Edits>(memo.current.overrides);
  // dirty: a card is open in its editor, or an applied edit was not saved since (both by word and dictionary)
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [unsaved, setUnsaved] = useState<Set<string>>(memo.current.unsaved);
  // bumped by a new lookup: the cards start again (an open editor does not outlive it)
  const [generation, setGeneration] = useState(0);
  const [confirmRelookup, setConfirmRelookup] = useState(false);
  const dirty = editing.size > 0 || unsaved.size > 0;
  const blocker = useBlocker(dirty);
  // Leave discards the edits for good: the page remembers its state across a visit elsewhere, and it must not
  // come back "dirty" with edits the user was told were gone
  function leave() {
    if (blocker.state !== "blocked") return;
    memo.current = { ...memo.current, overrides: {}, unsaved: new Set() };
    blocker.proceed();
  }
  const [notices, setNotices] = useState<Record<string, Notice>>({});

  useEffect(() => {
    memo.current = {
      input,
      dictionary: picked,
      words,
      searchedList,
      shownDict,
      notFound,
      searched,
      overrides,
      unsaved,
      entries: entries.current,
    };
  }, [
    memo,
    input,
    picked,
    words,
    searchedList,
    shownDict,
    notFound,
    searched,
    overrides,
    unsaved,
  ]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // which of the words on the page are saved, and their categories: the service answers for these words only (the list
  // can hold 1,000,000 words), again when the saved list changes
  const checkNames = useMemo(
    () =>
      [
        ...new Set(
          [...searchedList, ...words.map((w) => w.text)]
            .map(key)
            .filter(Boolean),
        ),
      ].slice(0, MAX_CHECK_WORDS),
    [searchedList, words],
  );
  const checkedKey = checkNames.join("\n");
  useEffect(() => {
    if (checkNames.length === 0 || !group) return;
    let live = true;
    api
      .checkSaved(group, checkNames)
      .then((found) => {
        if (live) setSavedCats((m) => withChecked(m, checkNames, found));
      })
      .catch(() => undefined); // only decides the label of the Save button
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, group, version, checkedKey]);

  // another group: the entries shown are fetched again in the dictionary that is selected there
  const shownGroup = useRef(group);
  useEffect(() => {
    if (shownGroup.current === group) return;
    shownGroup.current = group;
    chosen.current = dictionary;
    if (searched && dictionary)
      void fetchFor(
        dictionary,
        searchedList.filter((s) => !overrides[key(s)]?.[dictionary]),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  // the notices hide by themselves (AutoAlert); a new object shows one again
  // and are dropped from here too: a card that is rebuilt (another dictionary tab) must not show an old one again
  const flash = useCallback((id: string, n: Notice) => {
    const shown = { ...n };
    setNotices((m) => ({ ...m, [key(id)]: shown }));
    setTimeout(
      () =>
        setNotices((m) =>
          m[key(id)] === shown
            ? Object.fromEntries(
                Object.entries(m).filter(([k]) => k !== key(id)),
              )
            : m,
        ),
      NOTICE_MS,
    );
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      ask();
    }
  }

  /** A lookup the user asked for with the button: edits not saved are asked about first. */
  function ask(e?: FormEvent) {
    e?.preventDefault();
    if (dirty) setConfirmRelookup(true);
    else void submit();
  }

  const mark = (set: Set<string>, id: string, d: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(`${key(id)}|${d}`);
    else next.delete(`${key(id)}|${d}`);
    return next;
  };
  // a word saved: nothing of it is unsaved in the dictionaries of its group
  const settle = (set: Set<string>, id: string, ids: string[]) => {
    const saved = new Set(ids.map((d) => `${key(id)}|${d}`));
    return new Set([...set].filter((m) => !saved.has(m)));
  };

  /** A new lookup of the typed words: edits and entries of the last one are dropped. */
  async function submit(e?: FormEvent, dict: string = dictionary) {
    e?.preventDefault();
    const list = parseWords(input);
    if (list.length === 0 || list.length > maxWords || !dict) {
      setRetry(false);
      return setError(
        !dict
          ? new Localized("lookup.noDictionaries")
          : list.length === 0
            ? new Localized("lookup.empty")
            : new Localized("lookup.tooMany", { max: maxWords }),
      );
    }
    setSearched(true);
    setSearchedList(list);
    setOverrides({});
    entries.current = {};
    setUnsaved(new Set());
    setManualKeys(new Set());
    setGeneration((g) => g + 1);
    await fetchFor(dict, list);
  }

  /** Fetches the words in one dictionary and shows them (the words with an edit there are not in the list). */
  async function fetchFor(dict: string, list: string[]) {
    const id = ++seq.current;
    setBusy(true);
    let found: Word[] = [];
    let missing: string[] = [];
    let failed: unknown;
    try {
      if (list.length === 1) {
        try {
          found = [await api.lookup(list[0]!, dict)];
        } catch (err) {
          if (!(err instanceof ApiError && err.code === "not_found")) throw err;
          missing = list;
        }
      } else if (list.length > 1) {
        const r = await api.lookupMany(list, dict);
        found = r.words;
        missing = r.notFound;
      }
    } catch (err) {
      found = [];
      missing = [];
      failed = err;
    }
    if (id !== seq.current) return;
    for (const w of found) (entries.current[dict] ??= {})[key(w.text)] = w;
    setWords(found);
    setShownDict(dict);
    setNotices({});
    setNotFound(missing);
    setError(failed);
    setRetry(true);
    // an open editor belongs to the dictionary it was opened in
    setEditing(new Set());
    setBusy(false);
  }

  async function copy(id: string, html: string, text: string, mark = id) {
    try {
      await copyRich(html, text);
      markCopied(mark);
      flash(id, { kind: "success", text: new Localized("lookup.copied") });
    } catch {
      flash(id, { kind: "error", text: new Localized("lookup.copyFailed") });
    }
  }

  /** The entry of a word in one dictionary for the saved card: fetched before, the shown one, or fetched now (none: undefined). */
  async function entryOf(
    w: Word,
    d: string,
    lenient = false,
  ): Promise<Word | undefined> {
    const had =
      entries.current[d]?.[key(w.text)] ?? (d === shownDict ? w : undefined);
    if (had) return had;
    try {
      const got = await api.lookup(w.text, d);
      (entries.current[d] ??= {})[key(w.text)] = got;
      return got;
    } catch (err) {
      // no entry there, or an administrator turned that dictionary off: the card has one dictionary
      // a card written by hand does not need the dictionary: a failed lookup (the reason it was written) must not stop the save
      if (
        !lenient &&
        !(err instanceof ApiError && err.code === "not_found") &&
        serviceCode(err) !== "DICTIONARY_DISABLED"
      )
        throw err;
      return undefined;
    }
  }

  /** Saves the card of the dictionaries of the group, in the order of the registry: an edit of a dictionary replaces its entry, the others are fetched when needed. */
  async function save(w: Word): Promise<boolean> {
    const again = savedCats.has(key(w.text));
    const cats = categoriesOf(w);
    // the group can change while the entries are fetched: the card belongs to the one it was saved in
    const saveGroup = group;
    const ids = groupDicts.map((d) => d.id);
    setSaving(w.text);
    try {
      const edits = overrides[key(w.text)] ?? {};
      const lenient = isManual(w);
      const parts: CardPart[] = [];
      const audio = { audioUk: "", audioUs: "" };
      for (const id of ids) {
        const edit = edits[id];
        const entry = edit ? undefined : await entryOf(w, id, lenient);
        parts.push({ id, word: entry, html: edit?.content });
        audio.audioUk ||= edit?.audioUk || entry?.audioUk || "";
        audio.audioUs ||= edit?.audioUs || entry?.audioUs || "";
      }
      const r = await api.save({
        group: saveGroup,
        word: w.text,
        content: combinedCardBack(parts),
        audioUk: audio.audioUk,
        audioUs: audio.audioUs,
        ...(cats.length > 0 ? { categoryIds: cats } : {}),
      });
      setUnsaved((u) => settle(u, w.text, ids));
      setSavedCats((m) =>
        new Map(m).set(key(w.text), [
          ...new Set([...(m.get(key(w.text)) ?? []), ...cats]),
        ]),
      );
      setVersion((v) => v + 1);
      flash(w.text, {
        kind: "success",
        text: new Localized(again ? "lookup.overridden" : "lookup.saved", {
          word: w.text,
          count: r.savedCount,
          limit: settings.system.maxSavedWords,
        }),
      });
      return true;
    } catch (err) {
      flash(w.text, { kind: "error", text: err });
      return false;
    } finally {
      setSaving(undefined);
    }
  }

  /** Puts a word in a category or takes it out: a saved word at once on the service, the others in the pick that Save sends. */
  async function toggleCategory(w: Word, id: string) {
    const k = key(w.text);
    const had = categoriesOf(w);
    const on = had.includes(id);
    const next = on ? had.filter((x) => x !== id) : [...had, id];
    if (!savedCats.has(k)) {
      setDrafts((d) => ({ ...d, [k]: next }));
      return;
    }
    setSavedCats((m) => new Map(m).set(k, next));
    try {
      await api.updateWordCategories(
        group,
        [w.text],
        on ? [] : [id],
        on ? [id] : [],
      );
      notifySavedChanged();
    } catch (err) {
      setSavedCats((m) => new Map(m).set(k, had));
      flash(w.text, { kind: "error", text: err });
    }
  }

  /** Saves every shown entry in turn; stops at the first failure (the limit would fail the rest too). */
  async function saveAll() {
    setSavingAll(true);
    try {
      for (const w of shown) if (!(await save(w))) break;
    } finally {
      setSavingAll(false);
    }
  }

  // what the cards show, in the order typed: the fetched entry, or the one fetched before for a word that was not fetched again (it has an edit here), else an empty one
  const found = new Map(words.map((w) => [key(w.text), w]));
  const entryFor = (s: string) =>
    found.get(key(s)) ?? entries.current[shownDict]?.[key(s)];
  const shown = searchedList.flatMap((s) => {
    const entry = entryFor(s);
    return entry
      ? [entry]
      : overrides[key(s)]?.[shownDict] || manualKeys.has(key(s))
        ? [blank(s)]
        : [];
  });
  // a card with no entry behind it: written by hand
  const isManual = (w: Word) => !entryFor(w.text);
  const canWrite = can(P.dictionary.wordWrite);

  /** The words that can still get a card by hand: those not found, or all the typed ones when the lookup failed. */
  const candidates = (error ? searchedList : notFound).filter(
    (s) =>
      !entryFor(s) &&
      !overrides[key(s)]?.[shownDict] &&
      !manualKeys.has(key(s)),
  );

  /** Opens the editor of a card for each word, adding the words to the page when they are not in the last lookup. */
  function startManual(list: string[]) {
    setSearched(true);
    setSearchedList((l) => {
      const have = new Set(l.map(key));
      return [...l, ...list.filter((w) => !have.has(key(w)))];
    });
    setManualKeys((m) => new Set([...m, ...list.map(key)]));
  }

  const newProblem = wordProblem(newWord);
  const newClean = newWord.trim().replace(/\s+/g, " ");
  // the word typed for a new card: is it saved already? (asked once the user stops typing)
  const newCheck = newOpen && !newProblem && newClean ? newClean : "";
  useEffect(() => {
    if (!newCheck || !group) return;
    let live = true;
    const id = setTimeout(() => {
      api
        .checkSaved(group, [newCheck])
        .then((found) => {
          if (live) setSavedCats((m) => withChecked(m, [key(newCheck)], found));
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [api, group, newCheck, version]);

  function submitNew(e: FormEvent) {
    e.preventDefault();
    setNewTried(true);
    if (newProblem) return;
    // a word that is already on the page has its card: the user edits that one
    if (!entryFor(newClean) && !overrides[key(newClean)]?.[shownDict])
      startManual([newClean]);
    setNewOpen(false);
  }

  // the editor of a card starts from the part its dictionary gives: the first of the group has the phonetics
  const partOf = (w: Word, id: string) =>
    renderPart(
      id,
      w,
      registry.find((g) => g.dictionaries.some((d) => d.id === id))
        ?.dictionaries[0]?.id === id,
    );

  // desktop: the lookup on the left, the saved words on the right (the menu item Saved words stays)
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <h1 className="text-2xl font-semibold">{t("lookup.title")}</h1>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent>
              <form onSubmit={ask} className="space-y-3">
                <GroupSwitcher />
                <Tabs
                  value={dictionary}
                  onValueChange={(v) => {
                    const d = v;
                    // a tab fires on mouse down and on focus: the ref tells at once that this change was handled
                    if (d === chosen.current) return;
                    chosen.current = d;
                    setPicked(d);
                    // the words with an edit in this dictionary keep it, the others are fetched again
                    if (searched)
                      void fetchFor(
                        d,
                        searchedList.filter((s) => !overrides[key(s)]?.[d]),
                      );
                  }}
                >
                  {enabled.length > 1 ? (
                    <TabsList aria-label={t("lookup.dictionary")}>
                      {enabled.map((d) => (
                        <TabsTrigger key={d.id} value={d.id}>
                          {dictionaryLabel(t, d.id)}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  ) : null}
                </Tabs>
                <div className="relative">
                  <Label htmlFor="words" className="sr-only">
                    {t("lookup.input")}
                  </Label>
                  <Textarea
                    id="words"
                    value={input}
                    rows={3}
                    placeholder={t("lookup.placeholder")}
                    className={input ? "pr-9" : undefined}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                  />
                  {input ? (
                    <ClearButton
                      label={t("lookup.clear")}
                      className="top-2 translate-y-0"
                      onClick={() => {
                        setInput("");
                        document.getElementById("words")?.focus();
                      }}
                    />
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {t("lookup.hint", { max: maxWords })}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={t("lookup.copyInput")}
                      title={t("lookup.copyInput")}
                      className="max-sm:size-9 max-sm:px-0"
                      disabled={input.trim() === ""}
                      onClick={() =>
                        void copy(
                          "",
                          parseWords(input).map(escapeHtml).join("<br>"),
                          parseWords(input).join("\n"),
                          "#input",
                        )
                      }
                    >
                      {copied === "#input" ? (
                        <Check aria-hidden="true" />
                      ) : (
                        <Copy aria-hidden="true" className={iconTone.copy} />
                      )}
                      <span className="max-sm:sr-only">
                        {t("lookup.copyInput")}
                      </span>
                    </Button>
                    {canWrite ? (
                      <Button
                        type="button"
                        variant="outline"
                        aria-label={t("lookup.newCard")}
                        title={t("lookup.newCard")}
                        className="max-sm:size-9 max-sm:px-0"
                        onClick={() => {
                          setNewWord("");
                          setNewTried(false);
                          setNewOpen(true);
                        }}
                      >
                        <Plus aria-hidden="true" className={iconTone.add} />
                        <span className="max-sm:sr-only">
                          {t("lookup.newCard")}
                        </span>
                      </Button>
                    ) : null}
                    <Button
                      type="submit"
                      busy={busy}
                      aria-label={t("lookup.submit")}
                      title={t("lookup.submit")}
                      className="max-sm:size-9 max-sm:px-0"
                    >
                      <Search aria-hidden="true" />
                      <span className="max-sm:sr-only">
                        {t("lookup.submit")}
                      </span>
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>

          {registryLoaded && !dictionary ? (
            <Alert variant="warning">{t("lookup.noDictionaries")}</Alert>
          ) : null}
          {error ? (
            // space-y on the Alert itself would push its text below the icon (the icon is a child of the flex row)
            <Alert variant="destructive">
              <div className="space-y-2">
                <p>{errorMessage(error, t)}</p>
                {retry ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    busy={busy}
                    onClick={() => ask()}
                  >
                    <RefreshCw aria-hidden="true" />
                    {t("lookup.tryAgain")}
                  </Button>
                ) : null}
              </div>
            </Alert>
          ) : null}
          <AutoAlert
            variant={
              notices[""]?.kind === "success" ? "success" : "destructive"
            }
            watch={notices[""]}
          >
            {notices[""] ? errorMessage(notices[""].text, t) : null}
          </AutoAlert>
          {!error && candidates.length > 0 ? (
            <Alert variant="warning">
              <div className="space-y-2">
                <p>{t("lookup.noEntry", { words: candidates.join(", ") })}</p>
                {canWrite ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {candidates.length === 1 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startManual(candidates)}
                      >
                        <PenLine aria-hidden="true" />
                        {t("lookup.createManual")}
                      </Button>
                    ) : (
                      <>
                        {candidates.map((s) => (
                          <Button
                            key={s}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => startManual([s])}
                          >
                            <PenLine aria-hidden="true" />
                            {t("lookup.createCard", { word: s })}
                          </Button>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => startManual(candidates)}
                        >
                          {t("lookup.createAll", { count: candidates.length })}
                        </Button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </Alert>
          ) : null}
          {error && canWrite && candidates.length > 0 ? (
            <div
              className="space-y-2 rounded-lg border p-3"
              data-testid="manual-candidates"
            >
              <p className="text-sm text-muted-foreground">
                {t("lookup.manualHint")}
              </p>
              <div className="flex flex-wrap gap-2">
                {candidates.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => startManual([s])}
                  >
                    <PenLine aria-hidden="true" />
                    {t("lookup.createCard", { word: s })}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {shown.length > 1 ? (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  void copy("", cardsHtml(words), cardsText(words), "#all")
                }
              >
                {copied === "#all" ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" className={iconTone.copy} />
                )}
                {t("lookup.copyAll")}
              </Button>
              {can(P.dictionary.wordWrite) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  busy={savingAll}
                  disabled={saving !== undefined}
                  onClick={() => void saveAll()}
                >
                  <Save aria-hidden="true" className={iconTone.save} />
                  {t("lookup.saveAll")}
                </Button>
              ) : null}
            </div>
          ) : null}
          {shown.map((w) => (
            <WordCard
              key={`${generation}:${shownDict}:${w.text}`}
              word={w}
              canSave={canWrite}
              manual={isManual(w)}
              saving={saving === w.text}
              alreadySaved={savedCats.has(key(w.text))}
              categorySlot={
                <CategoryPicker
                  categories={categories}
                  label={t("lookup.categories")}
                  heading={t("lookup.categoriesFor", { word: w.text })}
                  count={categoriesOf(w).length}
                  state={(id) => categoriesOf(w).includes(id)}
                  onToggle={(id) => void toggleCategory(w, id)}
                  defaultLabel={t("lookup.setDefault")}
                  clearDefaultLabel={t("lookup.clearDefault")}
                  onClearDefault={
                    defaults.length > 0
                      ? () => {
                          // the cards that still follow the default keep what they show now
                          setDrafts((d) => {
                            const next = { ...d };
                            for (const x of shown)
                              if (
                                !savedCats.has(key(x.text)) &&
                                !(key(x.text) in next)
                              )
                                next[key(x.text)] = categoriesOf(x);
                            return next;
                          });
                          setDefaults([]);
                          writeLookupCategories([]);
                        }
                      : undefined
                  }
                  onSetDefault={() => {
                    const ids = categoriesOf(w);
                    setDefaults(ids);
                    writeLookupCategories(ids);
                  }}
                  onCreated={(c: Category) => void toggleCategory(w, c.id)}
                />
              }
              notice={notices[key(w.text)]}
              onSave={(x) => void save(x)}
              copied={copied === w.text}
              onCopy={(x) => void copy(x.text, cardsHtml([x]), cardText(x))}
              override={overrides[key(w.text)]?.[shownDict]}
              initial={
                overrides[key(w.text)]?.[shownDict] ?? {
                  content: partOf(w, shownDict),
                  audioUk: w.audioUk,
                  audioUs: w.audioUs,
                }
              }
              onApply={(x, o) => {
                setOverrides((m) => ({
                  ...m,
                  [key(x.text)]: { ...m[key(x.text)], [shownDict]: o },
                }));
                setUnsaved((u) => mark(u, x.text, shownDict, true));
              }}
              onRevert={(x) => {
                setOverrides((m) => {
                  const { [shownDict]: _gone, ...rest } = m[key(x.text)] ?? {};
                  return { ...m, [key(x.text)]: rest };
                });
                setUnsaved((u) => mark(u, x.text, shownDict, false));
              }}
              onEditing={(x, on) => {
                setEditing((e) => mark(e, x.text, shownDict, on));
                // a cancelled card with no edit goes away; an applied one stays through its override
                if (!on) {
                  setManualKeys((m) => {
                    if (!m.has(key(x.text))) return m;
                    const next = new Set(m);
                    next.delete(key(x.text));
                    return next;
                  });
                }
              }}
            />
          ))}
        </div>
        <Dialog
          open={blocker.state === "blocked"}
          onOpenChange={(open) =>
            !open && blocker.state === "blocked" && blocker.reset()
          }
        >
          <DialogContent closeLabel={t("common.close")}>
            <DialogHeader>
              <DialogTitle>{t("lookup.unsaved.title")}</DialogTitle>
              <DialogDescription>{t("lookup.unsaved.body")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => blocker.state === "blocked" && blocker.reset()}
              >
                {t("lookup.unsaved.stay")}
              </Button>
              <Button type="button" variant="destructive" onClick={leave}>
                {t("lookup.unsaved.leave")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogContent closeLabel={t("common.close")}>
            <form onSubmit={submitNew} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{t("lookup.manual.title")}</DialogTitle>
                <DialogDescription>{t("lookup.manual.hint")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="new-word">{t("lookup.manual.word")}</Label>
                <Input
                  id="new-word"
                  value={newWord}
                  autoComplete="off"
                  autoFocus
                  onChange={(e) => setNewWord(e.target.value)}
                />
                {newProblem && (newTried || newWord !== "") ? (
                  <p role="alert" className="text-sm text-destructive">
                    {t(`lookup.${newProblem}`)}
                  </p>
                ) : !newProblem && savedCats.has(key(newClean)) ? (
                  <p className="text-sm text-muted-foreground">
                    {t("lookup.manual.exists", { word: newClean })}
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewOpen(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit">{t("lookup.manual.continue")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={confirmRelookup} onOpenChange={setConfirmRelookup}>
          <DialogContent closeLabel={t("common.close")}>
            <DialogHeader>
              <DialogTitle>{t("lookup.unsaved.title")}</DialogTitle>
              <DialogDescription>
                {t("lookup.unsaved.relookup")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmRelookup(false)}
              >
                {t("lookup.unsaved.stay")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setConfirmRelookup(false);
                  void submit();
                }}
              >
                {t("lookup.submit")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <aside className="hidden min-w-0 lg:sticky lg:top-4 lg:block">
          <SavedList
            compact
            version={version}
            onChanged={() => setVersion((v) => v + 1)}
          />
        </aside>
      </div>
    </div>
  );
}
