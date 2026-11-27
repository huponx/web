import { P, useAuth } from "@huponx/auth-client";
import { Alert, AutoAlert, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, ClearButton, cn, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, iconTone, Input, Label, Loading, Progress, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, tone, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, useConfirm } from "@huponx/ui-kit";
import {
  Check,
  CircleCheck,
  Copy,
  Download,
  Link2,
  Pencil,
  Search,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  DEFAULT_DECK,
  downloadBase64,
  filterParams,
  serviceCode,
  UNCATEGORIZED,
  useDictionary,
} from "../api";
import type { Category, ExportScope, ExportSource, SavedWord } from "../api";
import {
  CATEGORY_COUNT_CAP,
  formatCount,
  removesAfterExport,
  REVIEW_COUNT_CAP,
  SAVED_CHANGED,
} from "../api";
import { ExportJobPanel } from "../ExportJobPanel";
import { GroupSwitcher } from "../GroupSwitcher";
import { useExportJob } from "../lib/useExportJob";
import { cardViewHtml, hasAudioSlot } from "../lib/cardHtml";
import {
  notifySavedChanged,
  useCategories,
  usePersistedCategory,
} from "../lib/categories";
import { formatInterval } from "../lib/interval";
import { useCardImages } from "../lib/useCardImages";
import { useCopied } from "../lib/useCopied";
import { errorMessage, Localized } from "../lib/errors";
import { formatBytes } from "../lib/bytes";
import { useRegistry } from "../lib/registry";
import { useSettings } from "../lib/settings";
import { nearlyFull, useStorage } from "../lib/useStorage";
import { CategoryChips, CategoryFilter, ManageCategories } from "./Categories";
import { CategoryPicker } from "./CategoryPicker";
import { CardEditor, preloadOn, usePreloadCardEditor } from "./LazyCardEditor";
import { Play } from "./PlayButton";
import { KIND_BADGE, KIND_LABEL, type CardKind } from "./Review";

/** How long the search box waits after the last keystroke before it asks the service. */
const SEARCH_DEBOUNCE_MS = 300;

/** The look of the back of a card (lists, rules, italics): the tags are bare, the page styles reset them. */
export const CARD_BODY =
  "space-y-1 text-sm [&_hr]:my-2 [&_hr]:border-border [&_i]:italic [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5";

/** The back of a card as it looks in Anki; `clamp` cuts it short with a fade, the full text is in the dialog. */
export function CardBody({
  content,
  clamp = false,
  audioUk = "",
  audioUs = "",
}: {
  content: string;
  clamp?: boolean;
  /** Played where the card puts its UK / US audio (the placeholders of the back). */
  audioUk?: string;
  audioUs?: string;
}) {
  const { t } = useTranslation();
  const html = useMemo(() => cardViewHtml(content), [content]);
  const body = useRef<HTMLDivElement>(null);
  useCardImages(body, html);
  const [slots, setSlots] = useState<HTMLElement[]>([]);
  useLayoutEffect(() => {
    setSlots(
      Array.from(
        body.current?.querySelectorAll<HTMLElement>("span[data-audio-slot]") ??
          [],
      ),
    );
  }, [html]);
  return (
    <div className={clamp ? "relative max-h-28 overflow-hidden" : undefined}>
      <div
        ref={body}
        className={`${CARD_BODY} [&_img]:h-auto [&_img]:max-h-64 [&_img[width]]:max-h-none [&_img]:max-w-full [&_img]:rounded-md`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {slots.map((el, i) => {
        const us = el.getAttribute("data-audio-slot") === "us";
        const url = us ? audioUs : audioUk;
        const region = t(us ? "lookup.us" : "lookup.uk");
        return url
          ? createPortal(
              <span className="inline-flex items-center align-middle text-muted-foreground">
                <Play url={url} region={region} />
              </span>,
              el,
              String(i),
            )
          : null;
      })}
      {clamp ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent"
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

/** The side panel of the lookup page shows this many words; the rest is on the page of the saved words. */
const COMPACT_LIMIT = 8;
/** Words per page of the list; the next page is read when the user asks for it. */
const PAGE_SIZE = 50;

/**
 * The next review of a word as a small pill next to its name, in the tone of its kind on the Review page: new,
 * learning or to review. The text is the rounded span to the due time (10m, 3d, 2mo, 1y), "Now" when it is due.
 */
function ReviewBadge({
  word,
}: {
  word: Pick<SavedWord, "nextReviewAt" | "learning">;
}) {
  const { t } = useTranslation();
  const kind: CardKind = !word.nextReviewAt
    ? "new"
    : word.learning
      ? "learning"
      : "review";
  let text = t("review.new");
  let label = t(KIND_LABEL[kind]);
  if (word.nextReviewAt) {
    const seconds = (Date.parse(word.nextReviewAt) - Date.now()) / 1000;
    text = seconds <= 0 ? t("saved.reviewNow") : formatInterval(seconds, t);
    label = `${label}: ${t("saved.reviewIn", { in: seconds <= 0 ? t("saved.reviewNow") : text })}`;
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={label}
            className={`ml-2 inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-1.5 text-xs font-medium ${KIND_BADGE[kind]}`}
          >
            {text}
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Marks a word that was packed in a deck and is still in the list. */
function ExportedBadge({ className = "ml-2" }: { className?: string }) {
  const { t } = useTranslation();
  const label = t("saved.exportedBadge");
  // the tooltip of the kit (a native title does not show in every browser or webview); it has its own provider
  // so the page needs none
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex align-middle ${className}`}>
            <CircleCheck
              role="img"
              aria-label={label}
              className="size-4 shrink-0 text-success"
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** The text of a card without its markup and audio placeholders: a one-line preview. DOMParser loads and runs nothing. */
function plainText(html: string): string {
  // block ends and line breaks become spaces, or "a fruit</li><li>an apple" would read "a fruitan apple"
  const doc = new DOMParser().parseFromString(
    html.replace(/<\/?(div|p|li|ul|ol|h\d)\b[^>]*>|<br\s*\/?>/gi, " "),
    "text/html",
  );
  doc.querySelectorAll("script, style").forEach((n) => n.remove());
  return (doc.body.textContent ?? "")
    .replace(/replace_audio_(uk|us)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A saved word as one row: tick, word, a line of the card, categories and date; the actions stay at the end. */
const SavedRow = memo(function SavedRow({
  w,
  write,
  checked,
  categories,
  onCheck,
  onOpen,
  onRemove,
}: {
  w: SavedWord;
  write: boolean;
  checked: boolean;
  categories: Category[];
  onCheck: (w: SavedWord) => void;
  onOpen: (w: SavedWord) => void;
  onRemove: (w: SavedWord) => void;
}) {
  const { t } = useTranslation();
  const preview = useMemo(() => plainText(w.content), [w.content]);
  return (
    <div
      className={`group relative flex items-start gap-3 px-3 py-3 hover:bg-accent/40 sm:items-center sm:px-4 ${checked ? "bg-primary/5" : ""}`}
    >
      {write ? (
        <Checkbox
          className="mt-1 sm:mt-0"
          aria-label={t("saved.select", { word: w.word })}
          checked={checked}
          onCheckedChange={() => onCheck(w)}
        />
      ) : null}
      <div
        role="button"
        tabIndex={0}
        aria-label={t("saved.open", { word: w.word })}
        className="min-w-0 flex-1 cursor-pointer rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:grid sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-4"
        onClick={() => onOpen(w)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(w);
          }
        }}
      >
        <div className="flex min-w-0 items-center justify-between gap-2 pr-[6.5rem] sm:justify-start sm:pr-0">
          <span className="flex min-w-0 items-center">
            <span className="truncate font-semibold">{w.word}</span>
            <ReviewBadge word={w} />
            {w.exported ? <ExportedBadge /> : null}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground sm:hidden">
            {shortDate(w.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 min-h-5 truncate pr-[6.5rem] text-sm text-muted-foreground sm:mt-0 sm:pr-0">
          {preview}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 empty:hidden sm:mt-0 sm:justify-end">
          <CategoryChips
            categories={categories}
            ids={w.categoryIds ?? []}
            max={3}
          />
          <span className="hidden w-14 text-right text-xs text-muted-foreground sm:inline">
            {shortDate(w.createdAt)}
          </span>
        </div>
      </div>
      <div className="absolute right-3 top-2 flex shrink-0 items-center opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100 sm:static">
        <Play url={w.audioUk} region={t("lookup.uk")} />
        <Play url={w.audioUs} region={t("lookup.us")} />
        {write ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={tone.danger}
            aria-label={t("saved.deleteWord", { word: w.word })}
            title={t("saved.deleteWord", { word: w.word })}
            onClick={() => onRemove(w)}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  );
});

/** Over this many rows only the ones on screen are drawn: a dialog or a scroll lock lays the whole list out again. */
const VIRTUAL_FROM = 100;
const ROW_CLASS = "border-b last:border-b-0";

/** The nearest ancestor that scrolls (the page main), else the window. */
function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "auto" || o === "scroll") return p;
  }
  return (document.scrollingElement as HTMLElement) ?? document.body;
}

/** The rows of the list; a long list is windowed (the rows have the height their content gives them). */
function RowList({
  words,
  busy,
  renderRow,
}: {
  words: SavedWord[];
  busy: boolean;
  renderRow: (w: SavedWord) => React.ReactNode;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [margin, setMargin] = useState(0);
  const virtual = words.length > VIRTUAL_FROM;
  useLayoutEffect(() => {
    if (virtual && ref.current) setScroller(scrollParent(ref.current));
  }, [virtual]);
  // where the list starts inside the scrolled content: measured when the rows or the window change, not on every
  // render (the position moves with the scroll anchoring of the browser, which would never settle)
  const count = words.length;
  useLayoutEffect(() => {
    if (!virtual || !ref.current || !scroller) return;
    const el = ref.current;
    const measure = () => {
      const top =
        el.getBoundingClientRect().top -
        (scroller === document.scrollingElement
          ? 0
          : scroller.getBoundingClientRect().top) +
        scroller.scrollTop;
      setMargin((m) => (Math.abs(m - top) < 2 ? m : Math.round(top)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [virtual, scroller, count]);
  const v = useVirtualizer({
    count: virtual ? words.length : 0,
    getScrollElement: () => scroller,
    estimateSize: () => (window.innerWidth >= 640 ? 57 : 96),
    overscan: 10,
    scrollMargin: margin,
    getItemKey: (i) => words[i]!.word,
  });
  const className = busy ? "opacity-60 transition-opacity" : undefined;
  if (!virtual)
    return (
      <ul aria-busy={busy} ref={ref} className={className}>
        {words.map((w) => (
          <li key={w.word} className={ROW_CLASS}>
            {renderRow(w)}
          </li>
        ))}
      </ul>
    );
  return (
    <ul
      aria-busy={busy}
      ref={ref}
      className={className}
      style={{ height: v.getTotalSize(), position: "relative" }}
    >
      {v.getVirtualItems().map((item) => (
        <li
          key={item.key}
          data-index={item.index}
          ref={v.measureElement}
          className={ROW_CLASS}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${item.start - v.options.scrollMargin}px)`,
          }}
        >
          {renderRow(words[item.index]!)}
        </li>
      ))}
    </ul>
  );
}

export interface SavedListProps {
  /** The narrow panel next to the lookup: a title in the card, no deck name field. */
  compact?: boolean;
  /** Changes when another part of the page saved a word: the list is read again. */
  version?: number;
  /** A word was deleted or the deck was exported: the other parts of the page may need to know. */
  onChanged?: () => void;
}

/** The pending saved words: search, delete one, or export them all as an Anki deck (which empties the list). */
export function SavedList({
  compact = false,
  version = 0,
  onChanged,
}: SavedListProps) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const api = useDictionary();
  // the list of the group the pages work in (the switcher of the page changes it)
  const { group, loaded: registryLoaded } = useRegistry();
  const [words, setWords] = useState<SavedWord[]>([]);
  // the panel read one page and the list has more words
  const [more, setMore] = useState(false);
  // the token of the next page of the full list (empty on the last page) and a read of it under way
  const [nextToken, setNextToken] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const {
    categories,
    list: catList,
    loaded: catsLoaded,
    reload: reloadCategories,
  } = useCategories(group);
  const [savedFilter, setSavedFilter] = usePersistedCategory(
    "saved",
    categories,
    catsLoaded,
  );
  // the narrow panel never filters
  const filter = compact ? "" : savedFilter;
  // words of the whole list (the totals above follow the category filter), for the progress bar and the exports
  const [allCounts, setAllCounts] = useState({ total: 0, newTotal: 0 });
  // the totals the list answered for the categories it was filtered by: their pills show them, fresher than the
  // list of categories (which replaces them when it is read again)
  const [filterCounts, setFilterCounts] = useState<Record<string, string>>({});
  useEffect(() => setFilterCounts({}), [catList]);
  // the words the user ticked, by word: they stay when a search or a filter shows other words
  const [selected, setSelected] = useState<Map<string, SavedWord>>(new Map());
  // the ticked words belong to a group: another group starts with none
  useEffect(() => setSelected(new Map()), [group]);
  const [managing, setManaging] = useState(false);
  // the export dialog: which export, and what it packs
  const [exportOpen, setExportOpen] = useState(false);
  const [source, setSource] = useState<"all" | "category" | "selected">("all");
  const [exportCategory, setExportCategory] = usePersistedCategory(
    "export",
    categories,
    catsLoaded,
  );
  // also pack the words that were exported before (the default packs the new ones only)
  const [includeExported, setIncludeExported] = useState(false);
  // the categories of the card in the editor
  const [editCategories, setEditCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  // a read after the first one: the list on screen stays (dimmed) until the new one arrives
  const [fetching, setFetching] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { settings } = useSettings();
  const limit = settings.system.maxSavedWords;
  const { storage, reload: reloadStorage } = useStorage();
  // an administrator can lower the limit under what a user already saved
  const over = allCounts.total > limit;
  const { allowExportDeck, allowExportLink } = settings.system;
  // what the user typed; untouched: the default name of the preferences
  const [typedDeck, setDeck] = useState<string>();
  const [copied, markCopied] = useCopied();
  const [error, setError] = useState<unknown>();
  // an object, so that the same text again shows the notice again (AutoAlert restarts on a new object)
  const [notice, setNotice] = useState<{ text: string }>();
  // the download link of the last "Export as link": an Anki app imports it, it works once
  const [link, setLink] = useState<{ url: string; expiresAt: string }>();
  const [linking, setLinking] = useState(false);
  // the export in parts of a list too long for one deck
  const jobs = useExportJob(api, can(P.dictionary.wordWrite) && !compact);
  const [busyPart, setBusyPart] = useState<number>();
  // the links of the parts of one job: a new link replaces the one before, so each is made once and kept
  const [partLinkState, setPartLinks] = useState<{
    jobId: string;
    links: Record<number, { url: string; expiresAt: string }>;
  }>();
  const partLinks =
    partLinkState && partLinkState.jobId === jobs.job?.id
      ? partLinkState.links
      : {};
  const jobStatus = jobs.job?.status;
  // the list is read again when a job that was going on ends: its words are exported (and may have left the list). A
  // finished job that is only shown again after a reload changes nothing.
  const wasActive = useRef(false);
  useEffect(() => {
    const active = jobStatus === "queued" || jobStatus === "running";
    if (wasActive.current && !active) {
      notifySavedChanged();
      onChanged?.();
    }
    wasActive.current = active;
  }, [jobStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  const { confirm, dialog } = useConfirm({
    title: t("common.confirmTitle"),
    confirm: t("common.confirm"),
    cancel: t("common.cancel"),
    close: t("common.close"),
  });
  const write = can(P.dictionary.wordWrite);
  usePreloadCardEditor(write);
  // the word whose full card is open
  const [viewing, setViewing] = useState<SavedWord>();
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<unknown>();
  // the card of the dialog; kept while the dialog fades out, so it does not go blank first
  const lastViewing = useRef<SavedWord>(undefined);
  if (viewing) lastViewing.current = viewing;
  const card = viewing ?? lastViewing.current;
  // stable, so that the rows (memo) are not drawn again by every change of the page
  const openCard = useCallback((w: SavedWord) => {
    setEditing(false);
    setEditError(undefined);
    setViewing(w);
  }, []);

  // the service does the search; it runs once the user stops typing
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(
      () => setDebouncedQuery(query.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(id);
  }, [query]);

  // the newest read wins: an older one that arrives late must not overwrite it
  const readSeq = useRef(0);
  const load = useCallback(() => {
    const seq = ++readSeq.current;
    if (!group) {
      // no group to read: still waiting for the registry, or it has no dictionary
      setLoading(!registryLoaded);
      return;
    }
    setFetching(true);
    // the panel shows the first COMPACT_LIMIT words, the list its first page: the rest is read on demand (the list can
    // hold 1,000,000 words); the totals come with the page
    const params = filterParams(filter);
    api
      .list(
        group,
        undefined,
        debouncedQuery,
        compact ? COMPACT_LIMIT : PAGE_SIZE,
        params,
      )
      .then((p) => ({
        words: p.words ?? [],
        total: p.total,
        newTotal: p.newTotal ?? p.total,
        countsCapped: p.countsCapped ?? false,
        more: !!p.nextPageToken,
        next: p.nextPageToken ?? "",
      }))
      .then(async (r) => {
        // with a filter the totals of the answer are the filter's: the whole list is one more (small) read
        const all = filter
          ? await api.list(group, undefined, "", 1).then((p) => ({
              total: p.total,
              newTotal: p.newTotal ?? p.total,
            }))
          : { total: r.total, newTotal: r.newTotal };
        if (seq !== readSeq.current) return;
        setWords(r.words);
        setMore(r.more);
        setNextToken(r.next);
        setAllCounts(all);
        if (filter)
          setFilterCounts((m) => ({
            ...m,
            [filter]: formatCount(
              r.total,
              r.countsCapped,
              filter === UNCATEGORIZED ? undefined : CATEGORY_COUNT_CAP,
            ),
          }));
        // the counts of the other pills may have changed elsewhere (another browser): read them with every list
        if (!compact) reloadCategories();
        // the ticked words that are on screen take their fresh data (categories)
        setSelected((sel) =>
          sel.size === 0
            ? sel
            : new Map(
                [...sel].map(([k, v]) => [
                  k,
                  r.words.find((x) => x.word === k) ?? v,
                ]),
              ),
        );
        setError(undefined);
      })
      .catch((e) => {
        if (seq === readSeq.current) setError(e);
      })
      .finally(() => {
        if (seq !== readSeq.current) return;
        setLoading(false);
        setFetching(false);
      });
  }, [api, group, registryLoaded, debouncedQuery, compact, filter, reloadCategories]);

  // `version` is the signal to read the list again
  useEffect(load, [load, version]);
  // another part of the app changed the list (the prompt that removes the exported words)
  useEffect(() => {
    window.addEventListener(SAVED_CHANGED, load);
    return () => window.removeEventListener(SAVED_CHANGED, load);
  }, [load]);

  /** Reads the next page of the list and adds it after the words on screen. */
  async function loadMore() {
    if (!nextToken || loadingMore) return;
    const seq = readSeq.current;
    setLoadingMore(true);
    try {
      const p = await api.list(
        group,
        nextToken,
        debouncedQuery,
        PAGE_SIZE,
        filterParams(filter),
      );
      if (seq !== readSeq.current) return; // the list was read again meanwhile
      setWords((list) => {
        const have = new Set(list.map((x) => x.word));
        return [...list, ...(p.words ?? []).filter((x) => !have.has(x.word))];
      });
      setNextToken(p.nextPageToken ?? "");
    } catch (e) {
      setError(e);
    } finally {
      setLoadingMore(false);
    }
  }

  async function remove(w: SavedWord) {
    if (
      !(await confirm({
        title: t("saved.deleteTitle"),
        message: t("saved.deleteMessage", { word: w.word }),
        confirmLabel: t("common.delete"),
      }))
    )
      return;
    try {
      await api.remove(group, w.word);
      setError(undefined);
      setWords((list) => list.filter((x) => x.word !== w.word));
      setAllCounts((c) => ({
        total: Math.max(0, c.total - 1),
        newTotal: w.exported ? c.newTotal : Math.max(0, c.newTotal - 1),
      }));
      setSelected((sel) => {
        const next = new Map(sel);
        next.delete(w.word);
        return next;
      });
      setNotice({ text: t("saved.deleted", { word: w.word }) });
      reloadStorage();
      onChanged?.();
    } catch (e) {
      setError(e);
    }
  }

  /** Saves the card the user edited: the word is saved again (an upsert, so it is the newest and new again). */
  async function saveEdit(
    w: SavedWord,
    edit: { content: string; audioUk: string; audioUs: string },
  ) {
    setSavingEdit(true);
    setEditError(undefined);
    try {
      // the word is saved again (which keeps its categories); the categories change by their own call
      await api.save({ group, word: w.word, ...edit });
      reloadStorage();
      const had = w.categoryIds ?? [];
      const add = editCategories.filter((id) => !had.includes(id));
      const drop = had.filter((id) => !editCategories.includes(id));
      if (add.length > 0 || drop.length > 0) {
        await api.updateWordCategories(group, [w.word], add, drop);
        notifySavedChanged();
      }
      const updated: SavedWord = {
        ...w,
        ...edit,
        categoryIds: editCategories,
        createdAt: new Date().toISOString(),
        exported: false,
      };
      setWords((list) => [updated, ...list.filter((x) => x.word !== w.word)]);
      if (w.exported) setAllCounts((c) => ({ ...c, newTotal: c.newTotal + 1 }));
      setViewing(updated);
      setEditing(false);
      onChanged?.();
    } catch (e) {
      setEditError(e);
    } finally {
      setSavingEdit(false);
    }
  }

  const removeRef = useRef(remove);
  removeRef.current = remove;
  const removeWord = useCallback(
    (w: SavedWord) => void removeRef.current(w),
    [],
  );

  // what the export does to the list, as far as the settings say (the service decides)
  const removes = removesAfterExport(settings);

  const toggleSelected = useCallback(
    (w: SavedWord) =>
      setSelected((sel) => {
        const next = new Map(sel);
        if (!next.delete(w.word)) next.set(w.word, w);
        return next;
      }),
    [],
  );
  const allSelected =
    words.length > 0 && words.every((w) => selected.has(w.word));

  /** How many of the ticked words are in the category: all of them, some or none. */
  const categoryState = (id: string): "all" | "some" | "none" => {
    const n = [...selected.values()].filter((w) =>
      w.categoryIds?.includes(id),
    ).length;
    return n === 0 ? "none" : n === selected.size ? "all" : "some";
  };

  /** Puts all the ticked words in the category, or takes them out of it when they are all in it already. */
  async function toggleCategory(id: string) {
    if (selected.size === 0) return;
    const remove = categoryState(id) === "all";
    try {
      await api.updateWordCategories(
        group,
        [...selected.keys()],
        remove ? [] : [id],
        remove ? [id] : [],
      );
      setSelected(
        (sel) =>
          new Map(
            [...sel].map(([k, w]) => {
              const ids = (w.categoryIds ?? []).filter((x) => x !== id);
              return [k, { ...w, categoryIds: remove ? ids : [...ids, id] }];
            }),
          ),
      );
      setError(undefined);
      setNotice({ text: t("categories.assigned", { count: selected.size }) });
      notifySavedChanged();
      onChanged?.();
    } catch (e) {
      setError(e);
    }
  }

  // the category the export dialog packs: the remembered one, else the first
  const exportCategoryValue =
    exportCategory || categories[0]?.id || UNCATEGORIZED;
  const exportCategoryRow = categories.find(
    (c) => c.id === exportCategoryValue,
  );
  const categoryCounts =
    exportCategoryValue === UNCATEGORIZED
      ? {
          total: catList.uncategorizedTotal ?? 0,
          newTotal: catList.uncategorizedNewTotal ?? 0,
        }
      : {
          total: exportCategoryRow?.total ?? 0,
          newTotal: exportCategoryRow?.newTotal ?? 0,
        };
  const sourceCounts =
    source === "all"
      ? allCounts
      : source === "category"
        ? categoryCounts
        : { total: selected.size, newTotal: selected.size };
  const chosenWords = [...selected.keys()];
  // The counts stop at a cap (1000 for a category, 10000 for the other sources, see api.ts): a new count at its cap is a
  // lower bound, so the number of exported words is not known, and the export of them is offered anyway.
  const sourceCap =
    source === "category" && exportCategoryValue !== UNCATEGORIZED
      ? CATEGORY_COUNT_CAP
      : REVIEW_COUNT_CAP;
  const newCapped = source !== "selected" && sourceCounts.newTotal >= sourceCap;
  // the total of the whole list is exact, the one of a category or of the uncategorized words is not
  const totalCapped = source === "category" && sourceCounts.total >= sourceCap;
  // only the first two sources ask what to pack, and only when they hold exported words
  const hasExported =
    source !== "selected" &&
    (newCapped || sourceCounts.total > sourceCounts.newTotal);
  const sendScope: ExportScope =
    hasExported && (includeExported || sourceCounts.newTotal === 0)
      ? "EXPORT_SCOPE_ALL"
      : "EXPORT_SCOPE_NEW";
  const exportCount =
    source === "selected"
      ? selected.size
      : sendScope === "EXPORT_SCOPE_ALL"
        ? sourceCounts.total
        : sourceCounts.newTotal;
  // "1000+ words will be exported" when the count that is exported stopped at its cap (a count that is not a number
  // does not pick a plural form, so it has a key of its own)
  const exportCountText =
    source !== "selected" &&
    (sendScope === "EXPORT_SCOPE_ALL" ? totalCapped : newCapped)
      ? t("saved.willExportMore", { count: `${sourceCap}+` })
      : t("saved.willExport", { count: exportCount });
  // the label of the box for the exported words: their number, or none when it is not known
  const includeExportedLabel = newCapped
    ? t("saved.includeExportedSome")
    : t("saved.includeExported", {
        count: sourceCounts.total - sourceCounts.newTotal,
      });
  // the name of the deck: what the user typed, else the one of the source
  const deck =
    typedDeck ??
    (source === "category" && exportCategoryRow
      ? exportCategoryRow.name
      : settings.user.deckName || DEFAULT_DECK);

  /** Opens the export dialog; with rows selected it starts on them. */
  function startExport(from?: "selected") {
    setExportOpen(true);
    setSource(from ?? (selected.size > 0 ? "selected" : "all"));
    setIncludeExported(false);
    setDeck(undefined);
  }

  function confirmExport(kind: "deck" | "link") {
    setExportOpen(false);
    const from: ExportSource =
      source === "selected"
        ? { words: chosenWords }
        : {
            scope: sendScope,
            ...(source === "category" ? filterParams(exportCategoryValue) : {}),
          };
    const name = deck.trim() || DEFAULT_DECK;
    void (kind === "deck" ? exportDeck(name, from) : exportLink(name, from));
  }

  async function exportDeck(name: string, from: ExportSource) {
    setExporting(true);
    try {
      const r = await api.exportAnki(group, name, from);
      downloadBase64(r.data, r.filename);
      setError(undefined);
      setNotice({
        text: t(removes ? "saved.exported" : "saved.exportedKept", {
          count: r.wordCount,
          file: r.filename,
        }),
      });
      setSelected(new Map());
      notifySavedChanged();
      onChanged?.();
    } catch (e) {
      if (serviceCode(e) === "EXPORT_USE_JOB" && !("words" in from)) {
        void offerJob(name, from);
      } else {
        setError(e);
      }
    } finally {
      setExporting(false);
    }
  }

  async function exportLink(name: string, from: ExportSource) {
    setLinking(true);
    try {
      const r = await api.exportLink(group, name, from);
      setLink({ url: r.url, expiresAt: r.expiresAt });
      setError(undefined);
      setNotice({
        text: t(removes ? "saved.exported" : "saved.exportedKept", {
          count: r.wordCount,
          file: r.filename,
        }),
      });
      setSelected(new Map());
      notifySavedChanged();
      onChanged?.();
    } catch (e) {
      if (serviceCode(e) === "EXPORT_USE_JOB" && !("words" in from)) {
        void offerJob(name, from);
      } else {
        setError(e);
      }
    } finally {
      setLinking(false);
    }
  }

  /** The list is too long for one deck: ask, then start the job that packs it in parts. */
  async function offerJob(name: string, from: ExportSource) {
    const ok = await confirm({
      title: t("saved.job.offerTitle"),
      message: t("saved.job.offerMessage"),
      confirmLabel: t("saved.job.offerConfirm"),
    });
    if (!ok) return;
    try {
      jobs.set(await api.startExport(group, name, from));
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  }

  // the link of a part, made once: asking again would replace the token that may be pasted elsewhere
  async function partLink(n: number) {
    if (!jobs.job) return undefined;
    const known = partLinks[n];
    if (known) return known;
    const id = jobs.job.id;
    const l = await api.exportPartLink(id, n);
    const made = { url: l.url, expiresAt: l.expiresAt };
    setPartLinks((s) => ({
      jobId: id,
      links: { ...(s?.jobId === id ? s.links : {}), [n]: made },
    }));
    return made;
  }

  async function downloadPart(n: number) {
    setBusyPart(n);
    try {
      const l = await partLink(n);
      if (l) window.location.assign(l.url);
    } catch (e) {
      setError(e);
    } finally {
      setBusyPart(undefined);
    }
  }

  // copies the link of a part, made first when there is none. The clipboard gets the promise of the text, so that Safari,
  // which allows a copy only right after the click, accepts it although the link is still being made.
  async function copyPartLink(n: number) {
    setBusyPart(n);
    let madeError: unknown;
    const url = partLink(n).then((l) => {
      if (!l) throw new Error("no job");
      return l.url;
    });
    url.catch((e: unknown) => (madeError = e));
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": url.then(
              (u) => new Blob([u], { type: "text/plain" }),
            ),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(await url);
      }
      markCopied("part-" + n);
    } catch {
      setError(madeError ?? new Localized("lookup.copyFailed"));
    } finally {
      setBusyPart(undefined);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      markCopied("link");
      setNotice({ text: t("saved.linkCopied") });
    } catch {
      setError(new Localized("lookup.copyFailed"));
    }
  }

  const pills = [
    { value: "", label: t("categories.all"), count: String(allCounts.total) },
    {
      value: UNCATEGORIZED,
      label: t("categories.uncategorized"),
      count: formatCount(
        catList.uncategorizedTotal ?? 0,
        catList.countsCapped ?? false,
      ),
    },
    ...categories.map((c) => ({
      value: c.id,
      label: c.name,
      count: formatCount(
        c.total ?? 0,
        catList.countsCapped ?? false,
        CATEGORY_COUNT_CAP,
      ),
    })),
  ].map((p) =>
    p.value in filterCounts ? { ...p, count: filterCounts[p.value]! } : p,
  );
  const canExport = write && (allowExportDeck || allowExportLink);

  return (
    <Card>
      {compact ? (
        <CardHeader>
          <CardTitle>{t("saved.title")}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className="space-y-4">
        {error ? <Alert variant="destructive">{errorMessage(error, t)}</Alert> : null}
        {storage && nearlyFull(storage.content) ? (
          <Alert variant="warning">{t("saved.storageFull")}</Alert>
        ) : null}
        {jobs.job ? (
          <ExportJobPanel
            job={jobs.job}
            busyPart={busyPart}
            copied={
              typeof copied === "string" && copied.startsWith("part-")
                ? Number(copied.slice(5))
                : undefined
            }
            onDownload={(n) => void downloadPart(n)}
            onCopyLink={(n) => void copyPartLink(n)}
            onCancel={() => void jobs.cancel()}
            onDismiss={jobs.dismiss}
          />
        ) : null}
        <AutoAlert variant="success" watch={notice}>
          {notice?.text}
        </AutoAlert>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-48 flex-1 space-y-1.5">
            <p
              className={cn(
                "text-sm",
                over ? "font-medium text-destructive" : "text-muted-foreground",
              )}
            >
              {allCounts.total > allCounts.newTotal
                ? t("saved.countKept", {
                    count: allCounts.total,
                    limit,
                    new: allCounts.newTotal,
                  })
                : t("saved.count", { count: allCounts.total, limit })}
            </p>
            <Progress
              value={allCounts.total}
              max={limit}
              tone={over ? "destructive" : "primary"}
              className="h-1.5 max-w-xs"
              aria-label={t("saved.title")}
            />
            {storage && storage.content.limit > 0 ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="saved-storage"
              >
                {t("saved.storage", {
                  used: formatBytes(storage.content.used),
                  limit: formatBytes(storage.content.limit),
                })}
              </p>
            ) : null}
          </div>
          {canExport ? (
            <Button
              type="button"
              busy={exporting || linking}
              disabled={allCounts.total === 0}
              onClick={() => startExport()}
            >
              <Download aria-hidden="true" />
              {t("saved.export")}
            </Button>
          ) : null}
        </div>
        {link ? (
          <div className="space-y-2 rounded-lg border p-3">
            <Label htmlFor="deck-link">{t("saved.linkLabel")}</Label>
            <div className="flex gap-2">
              <Input
                id="deck-link"
                readOnly
                value={link.url}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className={tone.copy}
                aria-label={t("saved.copyLink")}
                title={t("saved.copyLink")}
                onClick={() => void copyLink()}
              >
                {copied === "link" ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("saved.linkHint", {
                time: new Date(link.expiresAt).toLocaleTimeString(),
              })}
            </p>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="text"
              value={query}
              placeholder={t("saved.search")}
              aria-label={t("saved.search")}
              className={query ? "px-9" : "pl-9"}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <ClearButton
                label={t("saved.clearSearch")}
                onClick={() => setQuery("")}
              />
            ) : null}
          </div>
          {!compact && write ? (
            <Button
              type="button"
              variant="outline"
              aria-label={t("categories.manage")}
              title={t("categories.manage")}
              className="max-sm:size-9 max-sm:px-0"
              onClick={() => setManaging(true)}
            >
              <Tags aria-hidden="true" className={iconTone.tags} />
              <span className="max-sm:sr-only">{t("categories.manage")}</span>
            </Button>
          ) : null}
        </div>
        {!compact && categories.length > 0 ? (
          <div
            role="group"
            aria-label={t("saved.categoryFilter")}
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible"
          >
            {pills.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={filter === p.value}
                onClick={() => setSavedFilter(p.value)}
                className={`inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                  filter === p.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-accent"
                }`}
              >
                <span className="max-w-40 truncate">{p.label}</span>
                <span className="opacity-70">{p.count}</span>
              </button>
            ))}
          </div>
        ) : null}
        {!compact && write && selected.size > 0 ? (
          <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg bg-primary px-3 py-2 text-primary-foreground shadow-md">
            <span className="mr-auto text-sm font-medium">
              {t("saved.selected", { count: selected.size })}
            </span>
            {categories.length > 0 ? (
              <CategoryPicker
                categories={categories}
                label={t("saved.categoriesMenu")}
                heading={t("saved.setCategories", { count: selected.size })}
                variant="ghost"
                className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground max-sm:size-8 max-sm:px-0"
                state={(id) => {
                  const st = categoryState(id);
                  return st === "all"
                    ? true
                    : st === "some"
                      ? "indeterminate"
                      : false;
                }}
                onToggle={(id) => void toggleCategory(id)}
                onError={setError}
              />
            ) : null}
            {canExport ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={t("saved.exportSelected", { count: selected.size })}
                title={t("saved.exportSelected", { count: selected.size })}
                className="max-sm:size-8 max-sm:px-0"
                onClick={() => startExport("selected")}
              >
                <Download aria-hidden="true" />
                <span className="max-sm:sr-only">
                  {t("saved.exportSelected", { count: selected.size })}
                </span>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t("saved.clearSelection")}
              title={t("saved.clearSelection")}
              className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground max-sm:size-8 max-sm:px-0"
              onClick={() => setSelected(new Map())}
            >
              <X aria-hidden="true" className="sm:hidden" />
              <span className="max-sm:sr-only">
                {t("saved.clearSelection")}
              </span>
            </Button>
          </div>
        ) : null}
        {loading ? (
          <Loading label={t("common.loading")} />
        ) : allCounts.total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("saved.empty")}
          </p>
        ) : words.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("saved.noMatch")}
          </p>
        ) : !compact ? (
          <div className="overflow-hidden rounded-xl border">
            {write ? (
              <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:px-4">
                <Checkbox
                  aria-label={t("saved.selectAll")}
                  checked={
                    allSelected
                      ? true
                      : words.some((w) => selected.has(w.word))
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={() =>
                    setSelected((sel) => {
                      const next = new Map(sel);
                      for (const w of words) {
                        if (allSelected) next.delete(w.word);
                        else next.set(w.word, w);
                      }
                      return next;
                    })
                  }
                />
                <span>{t("saved.showing", { count: words.length })}</span>
              </div>
            ) : null}
            <RowList
              words={words}
              busy={fetching}
              renderRow={(w) => (
                <SavedRow
                  w={w}
                  write={write}
                  checked={selected.has(w.word)}
                  categories={categories}
                  onCheck={toggleSelected}
                  onOpen={openCard}
                  onRemove={removeWord}
                />
              )}
            />
          </div>
        ) : (
          <Table
            aria-busy={fetching}
            className={fetching ? "opacity-60 transition-opacity" : undefined}
          >
            <TableHeader>
              <TableRow>
                <TableHead>{t("saved.word")}</TableHead>
                <TableHead>{t("saved.savedAt")}</TableHead>
                {write ? (
                  <TableHead className="w-12">
                    <span className="sr-only">{t("saved.actions")}</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {words.map((w) => (
                <TableRow key={w.word}>
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      className="text-left hover:underline active:opacity-60"
                      onClick={() => openCard(w)}
                    >
                      {w.word}
                    </button>
                    <ReviewBadge word={w} />
                    {/* the badge is always under the word, so rows line up whatever the width */}
                    {w.exported ? <ExportedBadge className="ml-2" /> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {when(w.createdAt)}
                  </TableCell>
                  {write ? (
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className={tone.danger}
                        aria-label={t("saved.deleteWord", { word: w.word })}
                        title={t("saved.deleteWord", { word: w.word })}
                        onClick={() => void remove(w)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!compact && nextToken ? (
          <p className="pt-3 text-center">
            <Button
              variant="outline"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {t("common.loadMore")}
            </Button>
          </p>
        ) : null}
        {compact && more ? (
          <p className="pt-3 text-center text-sm">
            <Link to="/saved" className="text-primary hover:underline">
              {t("saved.viewAll", { shown: words.length })}
            </Link>
          </p>
        ) : null}
      </CardContent>
      {dialog}
      <ManageCategories
        open={managing}
        onOpenChange={setManaging}
        categories={categories}
      />
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("saved.exportTitle")}</DialogTitle>
            <DialogDescription>{t("saved.exportHint")}</DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">
              {t("saved.source")}
            </legend>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  ["all", t("saved.sourceAll"), false],
                  [
                    "category",
                    t("saved.sourceCategory"),
                    categories.length === 0,
                  ],
                  [
                    "selected",
                    t("saved.sourceSelected", { count: selected.size }),
                    selected.size === 0,
                  ],
                ] as const
              ).map(([value, label, disabled]) => (
                <label
                  key={value}
                  className="flex min-h-9 cursor-pointer items-center justify-center rounded-md px-2 text-center text-xs font-medium has-[:checked]:bg-background has-[:checked]:shadow-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 sm:text-sm"
                >
                  <input
                    type="radio"
                    name="export-source"
                    className="sr-only"
                    checked={source === value}
                    disabled={disabled}
                    onChange={() => {
                      setSource(value);
                      setDeck(undefined);
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
            {source === "category" ? (
              <CategoryFilter
                id="export-category"
                label={t("saved.exportCategory")}
                value={exportCategoryValue}
                onChange={(v) => {
                  setExportCategory(v);
                  setDeck(undefined);
                }}
                list={catList}
                hideAll
                className="w-full"
              />
            ) : null}
          </fieldset>
          {hasExported ? (
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <Checkbox
                className="mt-0.5"
                aria-label={includeExportedLabel}
                checked={sendScope === "EXPORT_SCOPE_ALL"}
                disabled={sourceCounts.newTotal === 0}
                onCheckedChange={(v) => setIncludeExported(v === true)}
              />
              <span>{includeExportedLabel}</span>
            </label>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="deck">{t("saved.deck")}</Label>
            <Input
              id="deck"
              value={deck}
              maxLength={100}
              onChange={(e) => setDeck(e.target.value)}
            />
          </div>
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            {exportCountText}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setExportOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            {allowExportLink ? (
              <Button
                type="button"
                variant="outline"
                disabled={exportCount === 0}
                onClick={() => confirmExport("link")}
              >
                <Link2 aria-hidden="true" />
                {t("saved.getLink")}
              </Button>
            ) : null}
            {allowExportDeck ? (
              <Button
                type="button"
                disabled={exportCount === 0}
                onClick={() => confirmExport("deck")}
              >
                <Download aria-hidden="true" />
                {t("saved.download")}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={viewing !== undefined}
        onOpenChange={(open) => {
          if (open) return;
          // the content stays until the closing animation is over (it is reset when a card is opened)
          setViewing(undefined);
        }}
      >
        <DialogContent
          closeLabel={t("common.close")}
          className="grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0"
        >
          <DialogHeader className="border-b bg-primary/10 px-6 py-4 pr-12 glass:bg-primary/[0.07] glass:border-primary/20 glass:shadow-[0_1px_0_0_rgb(255_255_255/0.8)]">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>{card?.word}</DialogTitle>
              {write && card && !editing ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditCategories(card.categoryIds ?? []);
                    setEditing(true);
                  }}
                  {...preloadOn}
                >
                  <Pencil aria-hidden="true" />
                  {t("lookup.edit")}
                </Button>
              ) : null}
            </div>
            <DialogDescription>
              {card ? when(card.createdAt) : null}
              {card?.exported ? <ExportedBadge /> : null}
            </DialogDescription>
            {card?.categoryIds?.length && !editing ? (
              <CategoryChips categories={categories} ids={card.categoryIds} />
            ) : null}
          </DialogHeader>
          {/* only the card scrolls: the word and the date stay where they are */}
          <div
            className={
              card && editing
                ? "flex min-h-0 flex-col"
                : "min-h-0 overflow-y-auto px-6 py-4"
            }
          >
            {card && editing ? (
              <div className="flex min-h-0 flex-1 flex-col">
                {editError ? (
                  <Alert variant="destructive" className="mx-6 mt-4">
                    {errorMessage(editError, t)}
                  </Alert>
                ) : null}
                {categories.length > 0 ? (
                  <div className="space-y-1.5 px-6 pt-4">
                    <Label>{t("categories.editLabel")}</Label>
                    <CategoryChips
                      categories={categories}
                      ids={editCategories}
                      label={t("categories.editLabel")}
                      onToggle={(id) =>
                        setEditCategories((ids) =>
                          ids.includes(id)
                            ? ids.filter((x) => x !== id)
                            : [...ids, id],
                        )
                      }
                    />
                  </div>
                ) : null}
                <CardEditor
                  initialContent={card.content}
                  initialAudio={{
                    audioUk: card.audioUk || "",
                    audioUs: card.audioUs || "",
                  }}
                  saving={savingEdit}
                  stickyActions
                  applyLabel={t("editor.save")}
                  onApply={(edit) => void saveEdit(card, edit)}
                  onCancel={() => {
                    setEditing(false);
                    setEditError(undefined);
                  }}
                />
              </div>
            ) : card ? (
              <div className="duration-200 animate-in fade-in-0 motion-reduce:animate-none">
                {(card.audioUk && !hasAudioSlot(card.content, "uk")) ||
                (card.audioUs && !hasAudioSlot(card.content, "us")) ? (
                  <div className="mb-2 flex flex-wrap items-center gap-x-4 text-sm text-muted-foreground">
                    {card.audioUk && !hasAudioSlot(card.content, "uk") ? (
                      <span className="inline-flex items-center">
                        {t("lookup.uk")}
                        <Play url={card.audioUk} region={t("lookup.uk")} />
                      </span>
                    ) : null}
                    {card.audioUs && !hasAudioSlot(card.content, "us") ? (
                      <span className="inline-flex items-center">
                        {t("lookup.us")}
                        <Play url={card.audioUs} region={t("lookup.us")} />
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <CardBody
                  content={card.content}
                  audioUk={card.audioUk}
                  audioUs={card.audioUs}
                />
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** The page of the saved words (menu item "Saved words"). */
export function Saved() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <h1 className="text-2xl font-semibold">{t("saved.title")}</h1>
      <GroupSwitcher />
      <SavedList />
    </div>
  );
}
