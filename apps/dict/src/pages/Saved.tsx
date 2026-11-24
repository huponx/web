import { useAuth } from "@huponx/auth-client";
import {
  Alert,
  AutoAlert,
  Loading,
  Progress,
  Button,
  Card,
  ClearButton,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useConfirm,
} from "@huponx/ui-kit";
import { CircleCheck, Copy, Download, Link2, Pencil, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_DECK, downloadBase64, useDictionary } from "../api";
import type { ExportScope, SavedWord } from "../api";
import { removesAfterExport, SAVED_CHANGED } from "../api";
import { cardViewHtml } from "../lib/cardHtml";
import { useCardImages } from "../lib/useCardImages";
import { errorMessage } from "../lib/errors";
import { useSettings } from "../lib/settings";
import { CardEditor } from "./LazyCardEditor";

/** The look of the back of a card (lists, rules, italics): the tags are bare, the page styles reset them. */
export const CARD_BODY =
  "space-y-1 text-sm [&_hr]:my-2 [&_hr]:border-border [&_i]:italic [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5";

/** The back of a card as it looks in Anki; `clamp` cuts it short with a fade, the full text is in the dialog. */
export function CardBody({
  content,
  clamp = false,
}: {
  content: string;
  clamp?: boolean;
}) {
  const html = useMemo(() => cardViewHtml(content), [content]);
  const body = useRef<HTMLDivElement>(null);
  useCardImages(body, html);
  return (
    <div className={clamp ? "relative max-h-28 overflow-hidden" : undefined}>
      <div ref={body} className={`${CARD_BODY} [&_img]:h-auto [&_img]:max-h-64 [&_img[width]]:max-h-none [&_img]:max-w-full [&_img]:rounded-md`} dangerouslySetInnerHTML={{ __html: html }} />
      {clamp ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent"
          aria-hidden="true"
        />
      ) : null}
    </div>
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
            <CircleCheck role="img" aria-label={label} className="size-4 shrink-0 text-success" />
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
  const [words, setWords] = useState<SavedWord[]>([]);
  const [total, setTotal] = useState(0);
  // how many of the words are new (never exported); the others were exported and kept in the list
  const [newTotal, setNewTotal] = useState(0);
  // the export the user is choosing the scope of (the list holds exported words)
  const [choosing, setChoosing] = useState<"deck" | "link">();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const { settings } = useSettings();
  const limit = settings.system.maxSavedWords;
  const { allowExportDeck, allowExportLink } = settings.system;
  // what the user typed; untouched: the default name of the preferences
  const [typedDeck, setDeck] = useState<string>();
  const deck = typedDeck ?? (settings.user.deckName || DEFAULT_DECK);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  // the download link of the last "Export as link": an Anki app imports it, it works once
  const [link, setLink] = useState<{ url: string; expiresAt: string }>();
  const [linking, setLinking] = useState(false);
  const { confirm, dialog } = useConfirm({
    title: t("common.confirmTitle"),
    confirm: t("common.confirm"),
    cancel: t("common.cancel"),
    close: t("common.close"),
  });
  const write = can("dictionary:word:write");
  // the word whose full card is open
  const [viewing, setViewing] = useState<SavedWord>();
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string>();

  const load = useCallback(() => {
    api
      .listAll()
      .then((r) => {
        setWords(r.words);
        setTotal(r.total);
        setNewTotal(r.newTotal);
        setError(undefined);
      })
      .catch((e) => setError(errorMessage(e, t)))
      .finally(() => setLoading(false));
  }, [api, t]);

  // `version` is the signal to read the list again
  useEffect(load, [load, version]);
  // another part of the app changed the list (the prompt that removes the exported words)
  useEffect(() => {
    window.addEventListener(SAVED_CHANGED, load);
    return () => window.removeEventListener(SAVED_CHANGED, load);
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? words.filter((w) => w.word.toLowerCase().includes(q)) : words;
  }, [words, query]);

  async function remove(w: SavedWord) {
    if (
      !(await confirm({
        title: t("saved.deleteTitle"),
        message: t("saved.deleteMessage", { word: w.word }),
        confirmLabel: t("common.delete"),
      }))
    )
      return;
    setError(undefined);
    setNotice(undefined);
    try {
      await api.remove(w.word);
      setWords((list) => list.filter((x) => x.word !== w.word));
      setTotal((n) => Math.max(0, n - 1));
      if (!w.exported) setNewTotal((n) => Math.max(0, n - 1));
      setNotice(t("saved.deleted", { word: w.word }));
      onChanged?.();
    } catch (e) {
      setError(errorMessage(e, t));
    }
  }

  /** Saves the card the user edited: the word is saved again (an upsert, so it is the newest and new again). */
  async function saveEdit(w: SavedWord, edit: { content: string; audioUk: string; audioUs: string }) {
    setSavingEdit(true);
    setEditError(undefined);
    try {
      await api.save({ word: w.word, ...edit });
      const updated: SavedWord = { ...w, ...edit, createdAt: new Date().toISOString(), exported: false };
      setWords((list) => [updated, ...list.filter((x) => x.word !== w.word)]);
      if (w.exported) setNewTotal((n) => n + 1);
      setViewing(updated);
      setEditing(false);
      onChanged?.();
    } catch (e) {
      setEditError(errorMessage(e, t));
    } finally {
      setSavingEdit(false);
    }
  }

  const hasExported = total > newTotal;
  // what the export does to the list, as far as the settings say (the service decides)
  const removes = removesAfterExport(settings);

  /** With exported words in the list the user chooses what to pack; without them there is only one choice. */
  function startExport(kind: "deck" | "link") {
    if (hasExported) setChoosing(kind);
    else
      void (kind === "deck"
        ? exportDeck("EXPORT_SCOPE_NEW")
        : exportLink("EXPORT_SCOPE_NEW"));
  }

  function choose(scope: ExportScope) {
    const kind = choosing;
    setChoosing(undefined);
    if (kind) void (kind === "deck" ? exportDeck(scope) : exportLink(scope));
  }

  async function exportDeck(scope: ExportScope) {
    setExporting(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const r = await api.exportAnki(deck.trim() || DEFAULT_DECK, scope);
      downloadBase64(r.data, r.filename);
      setNotice(
        t(removes ? "saved.exported" : "saved.exportedKept", {
          count: r.wordCount,
          file: r.filename,
        }),
      );
      load();
      onChanged?.();
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setExporting(false);
    }
  }

  async function exportLink(scope: ExportScope) {
    setLinking(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const r = await api.exportLink(deck.trim() || DEFAULT_DECK, scope);
      setLink({ url: r.url, expiresAt: r.expiresAt });
      setNotice(
        t(removes ? "saved.exported" : "saved.exportedKept", {
          count: r.wordCount,
          file: r.filename,
        }),
      );
      load();
      onChanged?.();
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setLinking(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setNotice(t("saved.linkCopied"));
    } catch {
      setError(t("lookup.copyFailed"));
    }
  }

  return (
    <Card>
      {compact ? (
        <CardHeader>
          <CardTitle>{t("saved.title")}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className="space-y-4">
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <AutoAlert variant="success">{notice}</AutoAlert>
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">
            {hasExported
              ? t("saved.countKept", { count: total, limit, new: newTotal })
              : t("saved.count", { count: total, limit })}
          </p>
          <Progress
            value={total}
            max={limit}
            className="h-1.5"
            aria-label={t("saved.title")}
          />
        </div>
        {write && (allowExportDeck || allowExportLink) ? (
          <div className="flex items-end gap-3 sm:flex-wrap">
            {compact ? null : (
              <div className="min-w-0 flex-1 space-y-2 sm:flex-none">
                <Label htmlFor="deck">{t("saved.deck")}</Label>
                <Input
                  id="deck"
                  value={deck}
                  maxLength={100}
                  onChange={(e) => setDeck(e.target.value)}
                />
              </div>
            )}
            {allowExportDeck ? (
              <Button
                type="button"
                busy={exporting}
                disabled={total === 0}
                aria-label={t("saved.export")}
                title={t("saved.export")}
                className="max-sm:size-9 max-sm:px-0"
                onClick={() => startExport("deck")}
              >
                <Download aria-hidden="true" />
                <span className="max-sm:sr-only">{t("saved.export")}</span>
              </Button>
            ) : null}
            {allowExportLink ? (
              <Button
                type="button"
                variant="outline"
                busy={linking}
                disabled={total === 0}
                aria-label={t("saved.exportLink")}
                title={t("saved.exportLink")}
                className="max-sm:size-9 max-sm:px-0"
                onClick={() => startExport("link")}
              >
                <Link2 aria-hidden="true" />
                <span className="max-sm:sr-only">{t("saved.exportLink")}</span>
              </Button>
            ) : null}
          </div>
        ) : null}
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
                aria-label={t("saved.copyLink")}
                title={t("saved.copyLink")}
                onClick={() => void copyLink()}
              >
                <Copy aria-hidden="true" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("saved.linkHint", {
                time: new Date(link.expiresAt).toLocaleTimeString(),
              })}
            </p>
          </div>
        ) : null}
        <div className="relative">
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
        {loading ? (
          <Loading label={t("common.loading")} />
        ) : words.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("saved.empty")}
          </p>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("saved.noMatch")}
          </p>
        ) : !compact ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((w) => (
              <li
                key={w.word}
                className="relative rounded-lg border shadow-sm transition-colors hover:bg-accent/40 glass:border-primary/30 glass:bg-card glass:shadow-md"
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={t("saved.open", { word: w.word })}
                  className="flex cursor-pointer flex-col gap-2 rounded-lg p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => setViewing(w)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setViewing(w);
                    }
                  }}
                >
                  <div className="-mx-4 -mt-4 min-w-0 rounded-t-lg border-b bg-primary/10 px-4 py-3 pr-12 glass:border-primary/20">
                    <p className="truncate text-base font-semibold">{w.word}</p>
                    <p className="text-xs text-muted-foreground">
                      {when(w.createdAt)}
                      {w.exported ? <ExportedBadge /> : null}
                    </p>
                  </div>
                  <CardBody content={w.content} clamp />
                </div>
                {write ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-3 right-3"
                    aria-label={t("saved.deleteWord", { word: w.word })}
                    title={t("saved.deleteWord", { word: w.word })}
                    onClick={() => void remove(w)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <Table>
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
              {shown.map((w) => (
                <TableRow key={w.word}>
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => setViewing(w)}
                    >
                      {w.word}
                    </button>
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
      </CardContent>
      {dialog}
      <Dialog
        open={choosing !== undefined}
        onOpenChange={(open) => !open && setChoosing(undefined)}
      >
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("saved.scopeTitle")}</DialogTitle>
            <DialogDescription>
              {t("saved.scopeMessage", {
                exported: total - newTotal,
                new: newTotal,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => choose("EXPORT_SCOPE_ALL")}
            >
              {t("saved.exportAll", { count: total })}
            </Button>
            <Button
              type="button"
              disabled={newTotal === 0}
              onClick={() => choose("EXPORT_SCOPE_NEW")}
            >
              {t("saved.exportNew", { count: newTotal })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={viewing !== undefined}
        onOpenChange={(open) => {
          if (open) return;
          setViewing(undefined);
          setEditing(false);
          setEditError(undefined);
        }}
      >
        <DialogContent
          closeLabel={t("common.close")}
          className="grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0"
        >
          <DialogHeader className="border-b bg-primary/10 px-6 py-4 pr-12 glass:border-primary/20">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>{viewing?.word}</DialogTitle>
              {write && viewing && !editing ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil aria-hidden="true" />
                  {t("lookup.edit")}
                </Button>
              ) : null}
            </div>
            <DialogDescription>
              {viewing ? when(viewing.createdAt) : null}
              {viewing?.exported ? <ExportedBadge /> : null}
            </DialogDescription>
          </DialogHeader>
          {/* only the card scrolls: the word and the date stay where they are */}
          <div className="min-h-0 overflow-y-auto px-6 py-4">
            {viewing && editing ? (
              <div className="space-y-3">
                {editError ? <Alert variant="destructive">{editError}</Alert> : null}
                <CardEditor
                  initialContent={viewing.content}
                  initialAudio={{ audioUk: viewing.audioUk || "", audioUs: viewing.audioUs || "" }}
                  saving={savingEdit}
                  applyLabel={t("editor.save")}
                  onApply={(edit) => void saveEdit(viewing, edit)}
                  onCancel={() => {
                    setEditing(false);
                    setEditError(undefined);
                  }}
                />
              </div>
            ) : viewing ? (
              <CardBody content={viewing.content} />
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
      <SavedList />
    </div>
  );
}
