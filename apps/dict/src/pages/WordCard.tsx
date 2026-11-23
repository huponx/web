import { AutoAlert, Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@huponx/ui-kit";
import { Bookmark, BookmarkCheck, Copy, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Word } from "../api";

function Play({ url, region }: { url: string; region: string }) {
  const { t } = useTranslation();
  if (!url) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t("lookup.play", { region })}
      title={t("lookup.play", { region })}
      onClick={() => void new Audio(url).play().catch(() => undefined)}
    >
      <Volume2 aria-hidden="true" />
    </Button>
  );
}

export interface WordCardProps {
  word: Word;
  canSave: boolean;
  saving: boolean;
  /** The word is already in the saved list: saving again overwrites it. */
  alreadySaved: boolean;
  /** Result of the last copy or save of this card; the page clears it after a moment. */
  notice?: { kind: "success" | "error"; text: string };
  onSave: (w: Word) => void;
  onCopy: (w: Word) => void;
}

/** One entry: headword, pronunciations, parts of speech, numbered meanings with examples. */
export function WordCard({ word, canSave, saving, alreadySaved, notice, onSave, onCopy }: WordCardProps) {
  const { t } = useTranslation();
  const uk = word.phoneticUk || (!word.phoneticUs ? word.phonetic : "");
  return (
    <Card data-testid={`word-${word.text}`}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-xl">{word.text}</CardTitle>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t("lookup.copyResult")}
            title={t("lookup.copyResult")}
            onClick={() => onCopy(word)}
          >
            <Copy aria-hidden="true" />
          </Button>
          {canSave ? (
            <Button
              type="button"
              size="icon-sm"
              variant={alreadySaved ? "destructive" : "default"}
              busy={saving}
              aria-label={alreadySaved ? t("lookup.saveOverride") : t("lookup.save")}
              title={alreadySaved ? t("lookup.saveOverride") : t("lookup.save")}
              onClick={() => onSave(word)}
            >
              {alreadySaved ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <AutoAlert variant={notice?.kind === "success" ? "success" : "destructive"} watch={notice}>
          {notice?.text}
        </AutoAlert>
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
        {word.partOfSpeech.length > 0 ? <p className="italic">{word.partOfSpeech.join(", ")}</p> : null}
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
      </CardContent>
    </Card>
  );
}
