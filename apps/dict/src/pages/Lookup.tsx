import { ApiError, useAuth } from "@huponx/auth-client";
import { Alert, AutoAlert, Button, Card, CardContent, ClearButton, Label, Tabs, TabsList, TabsTrigger, Textarea } from "@huponx/ui-kit";
import { Copy, Save, Search } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cardsHtml, cardsText, cardText, combinedCardBack, copyRich, escapeHtml } from "../anki";
import { enabledDictionaries, parseWords, serviceCode, startDictionary, useDictionary } from "../api";
import type { Dictionary, Word } from "../api";
import { errorMessage } from "../lib/errors";
import { useSettings } from "../lib/settings";
import { SavedList } from "./Saved";
import { WordCard } from "./WordCard";

type Notice = { kind: "success" | "error"; text: string };

const key = (w: string) => w.trim().toLowerCase();

/** What the lookup page shows: kept while the user visits another page, so coming back finds it as it was. */
interface Memo {
  input: string;
  /** What the user picked; none yet: the default of the settings. */
  dictionary: Dictionary | undefined;
  words: Word[];
  shownDict: Dictionary;
  notFound: string[];
  searched: boolean;
}

const MemoContext = createContext<{ current: Memo } | null>(null);

/** Keeps the lookup state above the routes (in memory only: a reload starts clean). */
export function LookupMemoProvider({ children }: { children: ReactNode }) {
  const memo = useRef<Memo>({ input: "", dictionary: undefined, words: [], shownDict: "DICTIONARY_ENGLISH", notFound: [], searched: false });
  return <MemoContext.Provider value={memo}>{children}</MemoContext.Provider>;
}

/** Lookup page: type words, pick the dictionary, read the entries, save them or copy them as Anki cards. */
export function Lookup() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const api = useDictionary();
  const { settings } = useSettings();
  const fallback = useRef<Memo>({ input: "", dictionary: undefined, words: [], shownDict: "DICTIONARY_ENGLISH", notFound: [], searched: false });
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
  const [notices, setNotices] = useState<Record<string, Notice>>({});

  useEffect(() => {
    memo.current = { input, dictionary: picked, words, shownDict, notFound, searched };
  }, [memo, input, picked, words, shownDict, notFound, searched]);

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
      void submit();
    }
  }

  async function submit(e?: FormEvent, dict: Dictionary = dictionary) {
    e?.preventDefault();
    setError(undefined);
    const list = parseWords(input);
    if (list.length === 0) return setError(t("lookup.empty"));
    if (list.length > maxWords) return setError(t("lookup.tooMany", { max: maxWords }));
    setBusy(true);
    setSearched(true);
    try {
      if (list.length === 1) {
        try {
          setWords([await api.lookup(list[0]!, dict)]);
          setShownDict(dict);
          setNotFound([]);
        } catch (err) {
          if (!(err instanceof ApiError && err.code === "not_found")) throw err;
          setWords([]);
          setNotFound(list);
        }
      } else {
        const r = await api.lookupMany(list, dict);
        setWords(r.words);
        setShownDict(dict);
        setNotFound(r.notFound);
      }
    } catch (err) {
      setWords([]);
      setNotFound([]);
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function copy(id: string, html: string, text: string) {
    try {
      await copyRich(html, text);
      flash(id, { kind: "success", text: t("lookup.copied") });
    } catch {
      flash(id, { kind: "error", text: t("lookup.copyFailed") });
    }
  }

  async function save(w: Word): Promise<boolean> {
    const again = savedSet.has(key(w.text));
    setSaving(w.text);
    try {
      // the saved card holds both dictionaries, English first: the shown entry is one of them, the other is fetched
      const other: Dictionary = shownDict === "DICTIONARY_ENGLISH" ? "DICTIONARY_ENGLISH_VIETNAMESE" : "DICTIONARY_ENGLISH";
      let second: Word | undefined;
      try {
        second = await api.lookup(w.text, other);
      } catch (err) {
        // no entry there, or an administrator turned that dictionary off: the card has one dictionary
        if (!(err instanceof ApiError && err.code === "not_found") && serviceCode(err) !== "DICTIONARY_DISABLED") throw err;
      }
      const en = shownDict === "DICTIONARY_ENGLISH" ? w : second;
      const vi = shownDict === "DICTIONARY_ENGLISH" ? second : w;
      const r = await api.save({
        word: w.text,
        content: combinedCardBack(en, vi),
        audioUk: en?.audioUk || vi?.audioUk || "",
        audioUs: en?.audioUs || vi?.audioUs || "",
      });
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
      for (const w of words) if (!(await save(w))) break;
    } finally {
      setSavingAll(false);
    }
  }

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
          <form onSubmit={(e) => void submit(e)} className="space-y-3">
            <Tabs
              value={dictionary}
              onValueChange={(v) => {
                const d = v as Dictionary;
                // a tab fires on mouse down and on focus: the ref tells at once that this change was handled
                if (d === chosen.current) return;
                chosen.current = d;
                setPicked(d);
                if (searched && parseWords(input).length > 0) void submit(undefined, d);
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
                {t("lookup.hint", { max: maxWords })} {t("lookup.submitHint")}
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
                  {busy ? null : <Search aria-hidden="true" />}
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

      {words.length > 1 ? (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copy("", cardsHtml(words), cardsText(words))}>
            <Copy aria-hidden="true" />
            {t("lookup.copyAll")}
          </Button>
          {can("dictionary:word:write") ? (
            <Button type="button" variant="outline" size="sm" busy={savingAll} disabled={saving !== undefined} onClick={() => void saveAll()}>
              {savingAll ? null : <Save aria-hidden="true" />}
              {t("lookup.saveAll")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {words.map((w) => (
        <WordCard
          key={w.text}
          word={w}
          canSave={can("dictionary:word:write")}
          saving={saving === w.text}
          alreadySaved={savedSet.has(key(w.text))}
          notice={notices[key(w.text)]}
          onSave={(x) => void save(x)}
          onCopy={(x) => void copy(x.text, cardsHtml([x]), cardText(x))}
        />
      ))}
    </div>
    <aside className="hidden min-w-0 lg:sticky lg:top-4 lg:block">
      <SavedList compact version={version} onChanged={() => setVersion((v) => v + 1)} />
    </aside>
    </div>
    </div>
  );
}
