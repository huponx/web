import {
  AutoAlert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@huponx/ui-kit";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Copy,
  Pencil,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../lib/errors";
import type { Word } from "../api";
import { hasAudioSlot } from "../lib/cardHtml";
import { CardBody } from "./Saved";
import { CardEditor, preloadOn, usePreloadCardEditor } from "./LazyCardEditor";
import { Play } from "./PlayButton";

/** What the user changed on the card of a lookup (not saved yet): the back of the card and the two audio URLs. */
export interface CardOverride {
  content: string;
  audioUk: string;
  audioUs: string;
}

export interface WordCardProps {
  word: Word;
  canSave: boolean;
  saving: boolean;
  /** The word is already in the saved list: saving again overwrites it. */
  alreadySaved: boolean;
  /** Result of the last copy or save of this card; the page clears it after a moment. */
  notice?: { kind: "success" | "error"; text: unknown };
  onSave: (w: Word) => void;
  onCopy: (w: Word) => void;
  /** The card was just copied: the copy button shows a tick. */
  copied?: boolean;
  /** The edit the user applied; the card shows it instead of the entry. */
  override?: CardOverride;
  onApply: (w: Word, o: CardOverride) => void;
  onRevert: (w: Word) => void;
  /** What the editor starts from: the applied edit of this dictionary, else the entry of it. */
  initial: CardOverride;
  /** The editor of this card opened or closed. */
  onEditing: (w: Word, editing: boolean) => void;
  /** The card is written by hand (no dictionary entry): it opens in the editor and shows a badge. */
  manual?: boolean;
  /** Shown before the copy and save buttons while the card is not in its editor (the category picker). */
  categorySlot?: ReactNode;
}

/** One entry: headword, pronunciations, parts of speech, numbered meanings with examples. */
export function WordCard({
  word,
  canSave,
  saving,
  alreadySaved,
  notice,
  onSave,
  onCopy,
  copied,
  override,
  onApply,
  onRevert,
  initial,
  onEditing,
  manual = false,
  categorySlot,
}: WordCardProps) {
  const { t } = useTranslation();
  // the editor takes the place of the entry inside the card; Save waits until the edit is applied or dropped
  const [editing, setEditingState] = useState(manual && !override);
  usePreloadCardEditor(canSave);
  const setEditing = (on: boolean) => {
    setEditingState(on);
    onEditing(word, on);
  };
  // a card made by hand opens in its editor: the page counts it as open from the start
  useEffect(() => {
    if (manual && !override) onEditing(word, true);
    // once, when the card appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const uk = word.phoneticUk || (!word.phoneticUs ? word.phonetic : "");
  return (
    <Card data-testid={`word-${word.text}`}>
      {/* the header (word and actions) is a tinted band across the top of the panel */}
      <CardHeader className="-mt-5 flex flex-row flex-wrap items-center justify-between gap-2 rounded-t-[inherit] border-b bg-primary/10 py-3 glass:bg-primary/[0.07] glass:border-primary/20 glass:shadow-[0_1px_0_0_rgb(255_255_255/0.8)]">
        <CardTitle className="text-xl">
          {word.text}
          {override ? (
            <Badge variant="outline" className="ml-2 align-middle font-normal">
              {t("lookup.edited")}
            </Badge>
          ) : null}
          {manual ? (
            <Badge variant="outline" className="ml-2 align-middle font-normal">
              {t("lookup.manualBadge")}
            </Badge>
          ) : null}
        </CardTitle>
        <div className="flex gap-1">
          {canSave && !editing ? categorySlot : null}
          {canSave && !editing ? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("lookup.edit")}
              title={t("lookup.edit")}
              onClick={() => setEditing(true)}
              {...preloadOn}
            >
              <Pencil aria-hidden="true" />
            </Button>
          ) : null}
          {override && !editing ? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("lookup.revert")}
              title={t("lookup.revert")}
              onClick={() => onRevert(word)}
            >
              <Undo2 aria-hidden="true" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t("lookup.copyResult")}
            title={t("lookup.copyResult")}
            onClick={() => onCopy(word)}
          >
            {copied ? (
              <Check aria-hidden="true" />
            ) : (
              <Copy aria-hidden="true" />
            )}
          </Button>
          {canSave ? (
            <Button
              type="button"
              size="icon-sm"
              variant={alreadySaved ? "destructive" : "default"}
              busy={saving}
              disabled={editing}
              aria-label={
                alreadySaved ? t("lookup.saveOverride") : t("lookup.save")
              }
              title={alreadySaved ? t("lookup.saveOverride") : t("lookup.save")}
              onClick={() => onSave(word)}
            >
              {alreadySaved ? (
                <BookmarkCheck aria-hidden="true" />
              ) : (
                <Bookmark aria-hidden="true" />
              )}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <AutoAlert
          variant={notice?.kind === "success" ? "success" : "destructive"}
          watch={notice}
        >
          {notice ? errorMessage(notice.text, t) : null}
        </AutoAlert>
        {editing ? (
          <CardEditor
            initialContent={initial.content}
            initialAudio={{
              audioUk: initial.audioUk,
              audioUs: initial.audioUs,
            }}
            applyLabel={t("editor.apply")}
            requireContent={manual}
            onApply={(o) => {
              onApply(word, o);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : override ? (
          <>
            {(override.audioUk && !hasAudioSlot(override.content, "uk")) ||
            (override.audioUs && !hasAudioSlot(override.content, "us")) ? (
              <div className="flex flex-wrap items-center gap-x-4 text-muted-foreground">
                {override.audioUk && !hasAudioSlot(override.content, "uk") ? (
                  <span className="inline-flex items-center">
                    {t("lookup.uk")}
                    <Play url={override.audioUk} region={t("lookup.uk")} />
                  </span>
                ) : null}
                {override.audioUs && !hasAudioSlot(override.content, "us") ? (
                  <span className="inline-flex items-center">
                    {t("lookup.us")}
                    <Play url={override.audioUs} region={t("lookup.us")} />
                  </span>
                ) : null}
              </div>
            ) : null}
            <CardBody
              content={override.content}
              audioUk={override.audioUk}
              audioUs={override.audioUs}
            />
          </>
        ) : (
          <>
            {uk || word.audioUk || word.phoneticUs || word.audioUs ? (
              <div className="flex flex-wrap items-center gap-x-4 text-muted-foreground">
                {uk || word.audioUk ? (
                  <span className="inline-flex items-center">
                    {t("lookup.uk")} {uk}
                    <Play url={word.audioUk} region={t("lookup.uk")} />
                  </span>
                ) : null}
                {word.phoneticUs || word.audioUs ? (
                  <span className="inline-flex items-center">
                    {t("lookup.us")} {word.phoneticUs}
                    <Play url={word.audioUs} region={t("lookup.us")} />
                  </span>
                ) : null}
              </div>
            ) : null}
            {word.partOfSpeech.length > 0 ? (
              <p className="italic">{word.partOfSpeech.join(", ")}</p>
            ) : null}
            {word.meanings.length === 0 ? (
              <p className="text-muted-foreground">{t("lookup.noMeanings")}</p>
            ) : (
              <ol className="list-decimal space-y-2 pl-5">
                {word.meanings.map((m, i) => (
                  <li key={i}>
                    {m.definition}
                    {m.machineTranslated ? (
                      <Badge variant="outline" className="ml-2 font-normal">
                        {t("lookup.machine")}
                      </Badge>
                    ) : null}
                    {m.examples.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 italic text-muted-foreground">
                        {m.examples.map((e, j) => (
                          <li key={j}>{e}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
