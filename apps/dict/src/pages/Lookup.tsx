import { ApiError, useAuth } from "@huponx/auth-client";
import { Alert, AutoAlert, Button, Card, CardContent, ClearButton, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label, Tabs, TabsList, TabsTrigger, Textarea } from "@huponx/ui-kit";
import { Copy, Save, Search } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useBlocker } from "react-router-dom";
import { cardsHtml, cardsText, cardText, copyRich, enPart, escapeHtml, joinParts, viPart } from "../anki";
import { enabledDictionaries, parseWords, serviceCode, startDictionary, useDictionary } from "../api";
import type { Dictionary, Word } from "../api";
import { errorMessage } from "../lib/errors";
import { useSettings } from "../lib/settings";
import { SavedList } from "./Saved";
import { WordCard } from "./WordCard";
import type { CardOverride } from "./WordCard";

type Notice = { kind: "success" | "error"; text: string };

const key = (w: string) => w.trim().toLowerCase();

const EN = "DICTIONARY_ENGLISH" as const;
const VI = "DICTIONARY_ENGLISH_VIETNAMESE" as const;

/** The edits of the user, by word and by dictionary. */
type Edits = Record<string, Partial<Record<Dictionary, CardOverride>>>;

/** A word with nothing in it: stands for a word that has an edit but no entry (yet) in the shown dictionary. */
const blank = (text: string): Word => ({ text, phonetic: "", phoneticUk: "", phoneticUs: "", audioUk: "", audioUs: "", partOfSpeech: [], meanings: [] });

/** The part of a saved card that one dictionary gives, as the editor starts from it. */
const partOf = (w: Word, d: Dictionary) => (d === EN ? enPart(w) : viPart(w, true));

/** What the lookup page shows: kept while the user visits another page, so coming back finds it as it was. */
interface Memo {
  input: string;
  /** What the user picked; none yet: the default of the settings. */
  dictionary: Dictionary | undefined;
  words: Word[];
  /** The words of the last lookup, as typed. */
  searchedList: string[];
  shownDict: Dictionary;
  notFound: string[];
  searched: boolean;
  /** The edits and the entries fetched: they live as long as the lookup does. */
  overrides: Edits;
  unsaved: Set<string>;
  entries: Record<Dictionary, Record<string, Word>>;
}

const MemoContext = createContext<{ current: Memo } | null>(null);

/** Keeps the lookup state above the routes (in memory only: a reload starts clean). */
export function LookupMemoProvider({ children }: { children: ReactNode }) {
  const memo = useRef<Memo>({ input: "", dictionary: undefined, words: [], searchedList: [], shownDict: "DICTIONARY_ENGLISH", notFound: [], searched: false, overrides: {}, unsaved: new Set(), entries: { [EN]: {}, [VI]: {} } });
  return <MemoContext.Provider value={memo}>{children}</MemoContext.Provider>;
}

/** Lookup page: type words, pick the dictionary, read the entries, save them or copy them as Anki cards. */
export function Lookup() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const api = useDictionary();
  const { settings } = useSettings();
  const fallback = useRef<Memo>({ input: "", dictionary: undefined, words: [], searchedList: [], shownDict: "DICTIONARY_ENGLISH", notFound: [], searched: false, overrides: {}, unsaved: new Set(), entries: { [EN]: {}, [VI]: {} } });
  const memo = useContext(MemoContext) ?? fallback;
  const [input, setInput] = useState(memo.current.input);
  const [picked, setPicked] = useState<Dictionary | undefined>(memo.current.dictionary);
  const enabled = enabledDictionaries(settings);
  // the pick of the user while that dictionary is on, else the default of the settings
  const dictionary: Dictionary = picked && enabled.includes(picked) ? picked : startDictionary(settings);
  const maxWords = settings.user.maxLookupWords;
  const chosen = useRef<Dictionary>(dictionary);
  chosen.current = dictionary;
  const [words, setWords] = useState<Word[]>(memo.current.words);
  // the dictionary the shown entries come from
  const [searchedList, setSearchedList] = useState<string[]>(memo.current.searchedList);
  // every entry fetched, by dictionary and word: Save reuses them
  const entries = useRef(memo.current.entries);
  // the last fetch wins when the user changes the tab quickly
  const seq = useRef(0);
  const [shownDict, setShownDict] = useState<Dictionary>(memo.current.shownDict);
  const [notFound, setNotFound] = useState<string[]>(memo.current.notFound);
  const [busy, setBusy] = useState(false);
  // a lookup was made: changing the dictionary then repeats it at once
  const [searched, setSearched] = useState(memo.current.searched);
  const [saving, setSaving] = useState<string>();
  const [savingAll, setSavingAll] = useState(false);
  const [error, setError] = useState<string>();
  // words already in the saved list (lower case): saving one of them again overwrites it
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
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
  const [notices, setNotices] = useState<Record<string, Notice>>({});

  useEffect(() => {
    memo.current = { input, dictionary: picked, words, searchedList, shownDict, notFound, searched, overrides, unsaved, entries: entries.current };
  }, [memo, input, picked, words, searchedList, shownDict, notFound, searched, overrides, unsaved]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    let live = true;
    api
      .listAll()
      .then((r) => {
        if (live) setSavedSet(new Set(r.words.map((w) => key(w.word))));
      })
      .catch(() => undefined); // only decides the label of the Save button
    return () => {
      live = false;
    };
  }, [api, version]);

  // the notices hide by themselves (AutoAlert); a new object shows one again
  const flash = useCallback((id: string, n: Notice) => {
    setNotices((m) => ({ ...m, [key(id)]: { ...n } }));
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

  const mark = (set: Set<string>, id: string, d: Dictionary, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(`${key(id)}|${d}`);
    else next.delete(`${key(id)}|${d}`);
    return next;
  };
  // a word saved: nothing of it is unsaved, in either dictionary
  const settle = (set: Set<string>, id: string) => new Set([...set].filter((m) => !m.startsWith(`${key(id)}|`)));

  /** A new lookup of the typed words: edits and entries of the last one are dropped. */
  async function submit(e?: FormEvent, dict: Dictionary = dictionary) {
    e?.preventDefault();
    const list = parseWords(input);
    if (list.length === 0) return setError(t("lookup.empty"));
    if (list.length > maxWords) return setError(t("lookup.tooMany", { max: maxWords }));
    setSearched(true);
    setSearchedList(list);
    setOverrides({});
    entries.current = { [EN]: {}, [VI]: {} };
    setUnsaved(new Set());
    setGeneration((g) => g + 1);
    await fetchFor(dict, list);
  }

  /** Fetches the words in one dictionary and shows them (the words with an edit there are not in the list). */
  async function fetchFor(dict: Dictionary, list: string[]) {
    const id = ++seq.current;
    setBusy(true);
    let found: Word[] = [];
    let missing: string[] = [];
    let failed: string | undefined;
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
      failed = errorMessage(err, t);
    }
    if (id !== seq.current) return;
    for (const w of found) entries.current[dict][key(w.text)] = w;
    setWords(found);
    setShownDict(dict);
    setNotFound(missing);
    setError(failed);
    // an open editor belongs to the dictionary it was opened in
    setEditing(new Set());
    setBusy(false);
  }

  async function copy(id: string, html: string, text: string) {
    try {
      await copyRich(html, text);
      flash(id, { kind: "success", text: t("lookup.copied") });
    } catch {
      flash(id, { kind: "error", text: t("lookup.copyFailed") });
    }
  }

  /** The entry of a word in one dictionary for the saved card: fetched before, the shown one, or fetched now (none: undefined). */
  async function entryOf(w: Word, d: Dictionary): Promise<Word | undefined> {
    const had = entries.current[d][key(w.text)] ?? (d === shownDict ? w : undefined);
    if (had) return had;
    try {
      const got = await api.lookup(w.text, d);
      entries.current[d][key(w.text)] = got;
      return got;
    } catch (err) {
      // no entry there, or an administrator turned that dictionary off: the card has one dictionary
      if (!(err instanceof ApiError && err.code === "not_found") && serviceCode(err) !== "DICTIONARY_DISABLED") throw err;
      return undefined;
    }
  }

  /** Saves the card of both dictionaries, English first: an edit of a dictionary replaces its entry, the other is fetched when needed. */
  async function save(w: Word): Promise<boolean> {
    const again = savedSet.has(key(w.text));
    setSaving(w.text);
    try {
      const edits = overrides[key(w.text)] ?? {};
      const en = edits[EN] ? undefined : await entryOf(w, EN);
      const vi = edits[VI] ? undefined : await entryOf(w, VI);
      const enHtml = edits[EN]?.content ?? (en ? enPart(en) : "");
      const viHtml = edits[VI]?.content ?? (vi ? viPart(vi, enHtml !== "") : "");
      const audio = (field: "audioUk" | "audioUs") => edits[EN]?.[field] || en?.[field] || edits[VI]?.[field] || vi?.[field] || "";
      const r = await api.save({ word: w.text, content: joinParts(enHtml, viHtml), audioUk: audio("audioUk"), audioUs: audio("audioUs") });
      setUnsaved((u) => settle(u, w.text));
      setSavedSet((set) => new Set(set).add(key(w.text)));
      setVersion((v) => v + 1);
      flash(w.text, { kind: "success", text: t(again ? "lookup.overridden" : "lookup.saved", { word: w.text, count: r.savedCount, limit: settings.system.maxSavedWords }) });
      return true;
    } catch (err) {
      flash(w.text, { kind: "error", text: errorMessage(err, t) });
      return false;
    } finally {
      setSaving(undefined);
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
  const shown = searchedList.flatMap((s) => {
    const entry = found.get(key(s)) ?? entries.current[shownDict][key(s)];
    return entry ? [entry] : overrides[key(s)]?.[shownDict] ? [blank(s)] : [];
  });

  const dicts: { id: Dictionary; label: string }[] = enabled.map((id) => ({
    id,
    label: id === "DICTIONARY_ENGLISH" ? t("lookup.english") : t("lookup.englishVietnamese"),
  }));

  // desktop: the lookup on the left, the saved words on the right (the menu item Saved words stays)
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
    <h1 className="text-2xl font-semibold">{t("lookup.title")}</h1>
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-6">
    <div className="min-w-0 space-y-4">
      <Card>
        <CardContent>
          <form onSubmit={ask} className="space-y-3">
            <Tabs
              value={dictionary}
              onValueChange={(v) => {
                const d = v as Dictionary;
                // a tab fires on mouse down and on focus: the ref tells at once that this change was handled
                if (d === chosen.current) return;
                chosen.current = d;
                setPicked(d);
                // the words with an edit in this dictionary keep it, the others are fetched again
                if (searched) void fetchFor(d, searchedList.filter((s) => !overrides[key(s)]?.[d]));
              }}
            >
              {dicts.length > 1 ? (
                <TabsList aria-label={t("lookup.dictionary")}>
                  {dicts.map((d) => (
                    <TabsTrigger key={d.id} value={d.id}>
                      {d.label}
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
                  onClick={() => void copy("", parseWords(input).map(escapeHtml).join("<br>"), parseWords(input).join("\n"))}
                >
                  <Copy aria-hidden="true" />
                  <span className="max-sm:sr-only">{t("lookup.copyInput")}</span>
                </Button>
                <Button type="submit" busy={busy} aria-label={t("lookup.submit")} title={t("lookup.submit")} className="max-sm:size-9 max-sm:px-0">
                  <Search aria-hidden="true" />
                  <span className="max-sm:sr-only">{t("lookup.submit")}</span>
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <AutoAlert variant={notices[""]?.kind === "success" ? "success" : "destructive"} watch={notices[""]}>
        {notices[""]?.text}
      </AutoAlert>
      {notFound.length > 0 ? <Alert variant="warning">{t("lookup.noEntry", { words: notFound.join(", ") })}</Alert> : null}

      {shown.length > 1 ? (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copy("", cardsHtml(words), cardsText(words))}>
            <Copy aria-hidden="true" />
            {t("lookup.copyAll")}
          </Button>
          {can("dictionary:word:write") ? (
            <Button type="button" variant="outline" size="sm" busy={savingAll} disabled={saving !== undefined} onClick={() => void saveAll()}>
              <Save aria-hidden="true" />
              {t("lookup.saveAll")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {shown.map((w) => (
        <WordCard
          key={`${generation}:${shownDict}:${w.text}`}
          word={w}
          canSave={can("dictionary:word:write")}
          saving={saving === w.text}
          alreadySaved={savedSet.has(key(w.text))}
          notice={notices[key(w.text)]}
          onSave={(x) => void save(x)}
          onCopy={(x) => void copy(x.text, cardsHtml([x]), cardText(x))}
          override={overrides[key(w.text)]?.[shownDict]}
          initial={overrides[key(w.text)]?.[shownDict] ?? { content: partOf(w, shownDict), audioUk: w.audioUk, audioUs: w.audioUs }}
          onApply={(x, o) => {
            setOverrides((m) => ({ ...m, [key(x.text)]: { ...m[key(x.text)], [shownDict]: o } }));
            setUnsaved((u) => mark(u, x.text, shownDict, true));
          }}
          onRevert={(x) => {
            setOverrides((m) => {
              const { [shownDict]: _gone, ...rest } = m[key(x.text)] ?? {};
              return { ...m, [key(x.text)]: rest };
            });
            setUnsaved((u) => mark(u, x.text, shownDict, false));
          }}
          onEditing={(x, on) => setEditing((e) => mark(e, x.text, shownDict, on))}
        />
      ))}
    </div>
    <Dialog open={blocker.state === "blocked"} onOpenChange={(open) => !open && blocker.state === "blocked" && blocker.reset()}>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("lookup.unsaved.title")}</DialogTitle>
          <DialogDescription>{t("lookup.unsaved.body")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => blocker.state === "blocked" && blocker.reset()}>
            {t("lookup.unsaved.stay")}
          </Button>
          <Button type="button" variant="destructive" onClick={() => blocker.state === "blocked" && blocker.proceed()}>
            {t("lookup.unsaved.leave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={confirmRelookup} onOpenChange={setConfirmRelookup}>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("lookup.unsaved.title")}</DialogTitle>
          <DialogDescription>{t("lookup.unsaved.relookup")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setConfirmRelookup(false)}>
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
      <SavedList compact version={version} onChanged={() => setVersion((v) => v + 1)} />
    </aside>
    </div>
    </div>
  );
}
