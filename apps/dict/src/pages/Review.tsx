import { ApiError } from "@huponx/auth-client";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Loading,
  Input,
  Label,
  Progress,
} from "@huponx/ui-kit";
import { CircleCheck, GraduationCap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { ReviewCard, ReviewQueue } from "../api";
import {
  filterParams,
  formatCount,
  REVIEW_GRADES,
  useDictionary,
} from "../api";
import { useCategories, usePersistedCategory } from "../lib/categories";
import { errorMessage, Localized } from "../lib/errors";
import { formatInterval } from "../lib/interval";
import { GroupSwitcher } from "../GroupSwitcher";
import { useRegistry } from "../lib/registry";
import { CategoryFilter } from "./Categories";
import { Play } from "./PlayButton";
import { CardBody } from "./Saved";

/** A card the service scheduled this soon is shown again in the same session (Again, or a step of learning). */
const REQUEUE_WITHIN_SECONDS = 20 * 60;

/**
 * The intervals of a card in learning with SM-2 (Again 1 minute, Hard 10 minutes, Good 1 day, Easy 4 days): used
 * when a card goes back in the queue and the service did not send the intervals of its new state (an older service).
 */
const LEARNING_INTERVALS = [60, 10 * 60, 24 * 3600, 4 * 24 * 3600];

export type CardKind = "new" | "learning" | "review";

/** The kind of a card, as Anki tells them: never reviewed, being learned (after Again or Hard) or due for review. */
function cardKind(card: Pick<ReviewCard, "isNew" | "learning">): CardKind {
  if (card.isNew) return "new";
  return card.learning ? "learning" : "review";
}

/** One tone per kind, the same in the overview and in the session; the numbers come before the cards of a kind. */
export const KIND_TEXT: Record<CardKind, string> = {
  new: "text-primary",
  learning: "text-warning",
  review: "text-success",
};
export const KIND_LABEL: Record<CardKind, string> = {
  new: "review.new",
  learning: "review.learning",
  review: "review.toReview",
};
/** A pill of a kind (a soft background with the text tone of the kind), for lists outside the session. */
export const KIND_BADGE: Record<CardKind, string> = {
  new: "bg-primary/10 text-primary",
  learning: "bg-warning/15 text-warning",
  review: "bg-success/10 text-success",
};
const KINDS: CardKind[] = ["new", "learning", "review"];

interface Session {
  cards: ReviewCard[];
  total: number;
  finished: number;
  again: number;
}

/** Keys that are typed into: the shortcuts of the review leave them alone. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

function CardView({
  card,
  session,
  onGrade,
  busy,
  error,
}: {
  card: ReviewCard;
  session: Session;
  onGrade: (i: number) => void;
  busy: boolean;
  error?: unknown;
}) {
  const { t } = useTranslation();
  const [flipped, setFlipped] = useState(false);
  // the back is mounted closed and opens on the next frame, so the change is animated
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!flipped) return;
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, [flipped]);
  // the latest values for the one listener of the window
  const state = useRef({ flipped, busy, onGrade });
  state.current = { flipped, busy, onGrade };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target))
        return;
      const { flipped: back, busy: sending, onGrade: grade } = state.current;
      if (e.key === " " || e.key === "Enter") {
        if (!back) {
          e.preventDefault();
          setFlipped(true);
        }
        return;
      }
      const i = Number(e.key) - 1;
      if (
        back &&
        !sending &&
        Number.isInteger(i) &&
        i >= 0 &&
        i < REVIEW_GRADES.length
      ) {
        e.preventDefault();
        grade(i);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const intervals =
    card.gradeIntervalsSeconds.length === REVIEW_GRADES.length
      ? card.gradeIntervalsSeconds
      : LEARNING_INTERVALS;
  const current = cardKind(card);
  const remaining: Record<CardKind, number> = {
    new: 0,
    learning: 0,
    review: 0,
  };
  for (const c of session.cards) remaining[cardKind(c)]++;
  const names = ["again", "hard", "good", "easy"] as const;
  // from hardest to easiest: red, amber, green, blue
  const tones: Record<(typeof names)[number], string> = {
    again:
      "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 active:bg-destructive/25",
    hard: "border-warning/40 bg-warning/10 text-warning hover:bg-warning/20 active:bg-warning/25",
    good: "border-success/40 bg-success/10 text-success hover:bg-success/20 active:bg-success/25",
    easy: "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary/25",
  };

  return (
    // as high as the page lets it be (screen minus the header and the padding of the shell), so the progress and the
    // buttons stay in place and only the card scrolls; the theme may be glass, so nothing is painted over the card
    <div className="mx-auto flex h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] w-full max-w-2xl flex-col gap-3 md:h-[calc(100dvh-7rem-env(safe-area-inset-bottom))]">
      <div className="shrink-0 space-y-1">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="flex gap-3" data-testid="review-remaining">
            {KINDS.map((kind) => (
              <span
                key={kind}
                className={`${KIND_TEXT[kind]} ${kind === current ? "font-semibold underline underline-offset-4" : ""}`}
                aria-current={kind === current ? "true" : undefined}
              >
                {t(KIND_LABEL[kind])}{" "}
                <span data-testid={`session-${kind}`}>{remaining[kind]}</span>
              </span>
            ))}
          </span>
          <span aria-live="polite">
            {t("review.progress", {
              done: session.finished,
              total: session.total,
            })}
          </span>
        </div>
        <Progress
          value={session.finished}
          max={session.total}
          className="h-1.5"
          aria-label={t("review.title")}
        />
      </div>
      {/* the panel is as high as its content (just the word before the answer) up to the room there is, and only the
          back scrolls inside it; the back opens by growing its grid row, which animates where `height: auto` cannot */}
      <div className="flex min-h-0 flex-1 flex-col">
        <Card className="min-h-0 gap-0 py-0 duration-200 animate-in fade-in-0 motion-reduce:animate-none">
          <CardContent className="flex min-h-0 flex-col gap-0 py-6">
            {/* the word is centered on the whole card (the padding on both sides keeps it clear of the buttons); the
                buttons sit at the right edge, a little low because lowercase letters sit below the middle of the line */}
            <div className="relative shrink-0 px-16">
              <h2
                className="text-center text-3xl font-semibold break-words"
                data-testid="review-word"
              >
                {card.word}
              </h2>
              <div className="absolute inset-y-0 right-0 flex items-center pt-1">
                <Play url={card.audioUk} region={t("lookup.uk")} />
                <Play url={card.audioUs} region={t("lookup.us")} />
              </div>
            </div>
            {flipped ? (
              <div
                className={`grid min-h-0 transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${open ? "mt-4 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"}`}
                data-testid="review-back"
              >
                <div className="min-h-0 overflow-y-auto border-t pt-4">
                  <CardBody content={card.content} />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
      {error ? (
        <Alert className="shrink-0" variant="destructive">
          {errorMessage(error, t)}
        </Alert>
      ) : null}
      <div className="shrink-0">
        {flipped ? (
          <div
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            role="group"
            aria-label={t("review.howWell")}
          >
            {names.map((name, i) => (
              <Button
                key={name}
                type="button"
                variant="outline"
                className={`h-auto flex-col gap-0.5 py-2 shadow-none ${tones[name]}`}
                disabled={busy}
                onClick={() => onGrade(i)}
              >
                <span className="text-base font-semibold">
                  {t(`review.grade.${name}`)}
                </span>
                <span className="text-[11px] leading-none font-normal opacity-80">
                  {formatInterval(intervals[i] ?? 0, t)}
                </span>
                <kbd className="sr-only">{i + 1}</kbd>
              </Button>
            ))}
          </div>
        ) : (
          <Button
            type="button"
            className="w-full"
            onClick={() => setFlipped(true)}
          >
            {t("review.showAnswer")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Review of the saved words with spaced repetition: an overview, the cards one by one and a summary. */
export function Review() {
  const { t } = useTranslation();
  const api = useDictionary();
  const { group } = useRegistry();
  const [queue, setQueue] = useState<ReviewQueue>();
  const [loadError, setLoadError] = useState<unknown>();
  const [session, setSession] = useState<Session>();
  const [done, setDone] = useState<Session>();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const { categories, list: catList, loaded: catsLoaded } = useCategories(group);
  const [category, setCategory] = usePersistedCategory(
    "review",
    categories,
    catsLoaded,
  );

  const load = useCallback(() => {
    setLoadError(undefined);
    if (!group) return Promise.resolve();
    return api
      .getReviewQueue(group, undefined, filterParams(category))
      .then(setQueue)
      .catch((e: unknown) => setLoadError(e));
  }, [api, group, category]);

  // another group has its own queue
  useEffect(() => {
    setQueue(undefined);
    setDone(undefined);
  }, [group]);

  useEffect(() => {
    void load();
  }, [load]);

  function start() {
    if (!queue || queue.cards.length === 0) return;
    setDone(undefined);
    setError(undefined);
    setStep(0);
    setSession({
      cards: queue.cards,
      total: queue.cards.length,
      finished: 0,
      again: 0,
    });
  }

  async function grade(i: number) {
    const card = session?.cards[0];
    const g = REVIEW_GRADES[i];
    if (!session || !card || !g || busy) return;
    setBusy(true);
    try {
      const r = await api.submitReview(card.group, card.word, g);
      setError(undefined);
      const again = session.again + (g === "REVIEW_GRADE_AGAIN" ? 1 : 0);
      const rest = session.cards.slice(1);
      // a card due within minutes goes to the end of the queue; its state is learning now
      if (r.intervalSeconds <= REQUEUE_WITHIN_SECONDS) {
        rest.push({
          ...card,
          isNew: false,
          learning: true,
          gradeIntervalsSeconds:
            r.gradeIntervalsSeconds.length === REVIEW_GRADES.length
              ? r.gradeIntervalsSeconds
              : LEARNING_INTERVALS,
        });
        setSession({ ...session, cards: rest, again });
      } else if (rest.length > 0) {
        setSession({
          ...session,
          cards: rest,
          finished: session.finished + 1,
          again,
        });
      } else {
        setSession(undefined);
        setDone({
          ...session,
          cards: [],
          finished: session.finished + 1,
          again,
        });
        setQueue(undefined);
        void load();
      }
      setStep((n) => n + 1);
    } catch (e) {
      // the card stays: grade it again (a word that left the list is not found)
      setError(
        e instanceof ApiError && e.code === "not_found"
          ? new Localized("review.notInList")
          : e,
      );
    } finally {
      setBusy(false);
    }
  }

  if (session && session.cards[0]) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <h1 className="sr-only">{t("review.title")}</h1>
        <CardView
          key={`${step}-${session.cards[0].word}`}
          card={session.cards[0]}
          session={session}
          onGrade={(i) => void grade(i)}
          busy={busy}
          error={error}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">{t("review.title")}</h1>
      <GroupSwitcher />
      {loadError ? (
        <Alert variant="destructive">
          {errorMessage(loadError, t)}{" "}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            onClick={() => void load()}
          >
            {t("common.tryAgain")}
          </Button>
        </Alert>
      ) : null}
      {!queue && !loadError ? <Loading label={t("common.loading")} /> : null}
      {categories.length > 0 ? (
        <CategoryFilter
          id="review-category"
          label={t("review.categoryFilter")}
          value={category}
          onChange={(v) => {
            setDone(undefined);
            setQueue(undefined);
            setCategory(v);
          }}
          list={catList}
        />
      ) : null}
      {queue ? (
        <Overview
          queue={queue}
          done={done}
          filtered={category !== ""}
          onStart={start}
          onMore={async (newWords, reviews) => {
            await api.addReviewBonus(newWords, reviews);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function Overview({
  queue,
  done,
  filtered,
  onStart,
  onMore,
}: {
  queue: ReviewQueue;
  done?: Session;
  /** A category filter is on: no words means none in the category, not none saved. */
  filtered: boolean;
  onStart: () => void;
  /** Raises today's limits, then reads the queue again. */
  onMore: (newWords: number, reviews: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const ready = queue.newCount + queue.learningCount + queue.dueCount;
  const wait = queue.nextDueAt
    ? (Date.parse(queue.nextDueAt) - Date.now()) / 1000
    : undefined;

  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        {done ? (
          <div className="space-y-1 text-center" data-testid="review-done">
            <CircleCheck
              className="mx-auto size-10 text-success"
              aria-hidden="true"
            />
            <h2 className="text-xl font-semibold">{t("review.doneTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("review.doneStats", {
                count: done.finished,
                again: done.again,
              })}
            </p>
          </div>
        ) : null}
        {queue.totalCount === 0 ? (
          <div className="space-y-3 text-center">
            <GraduationCap
              className="mx-auto size-10 text-muted-foreground"
              aria-hidden="true"
            />
            <p>{t(filtered ? "review.noWordsCategory" : "review.noWords")}</p>
            {filtered ? null : (
              <Button asChild variant="outline">
                <Link to="/">{t("review.goLookup")}</Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            {ready > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-4 text-center">
                  {(
                    [
                      ["new", queue.newCount],
                      ["learning", queue.learningCount],
                      ["review", queue.dueCount],
                    ] as const
                  ).map(([kind, n]) => (
                    <div key={kind}>
                      <p
                        className={`text-3xl font-semibold ${KIND_TEXT[kind]}`}
                        data-testid={`review-${kind}`}
                      >
                        {n}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t(KIND_LABEL[kind])}
                      </p>
                    </div>
                  ))}
                </div>
                <Button type="button" className="w-full" onClick={onStart}>
                  {t("review.start")}
                </Button>
              </>
            ) : (
              <div className="space-y-1 text-center">
                {done ? null : (
                  <>
                    <CircleCheck
                      className="mx-auto size-10 text-success"
                      aria-hidden="true"
                    />
                    <p className="font-medium">{t("review.caughtUp")}</p>
                  </>
                )}
                {queue.newHeld > 0 || queue.dueHeld > 0 ? (
                  <StudyMore
                    key={`${queue.newHeld}-${queue.dueHeld}`}
                    newHeld={queue.newHeld}
                    dueHeld={queue.dueHeld}
                    capped={queue.countsCapped}
                    onMore={onMore}
                  />
                ) : null}
              </div>
            )}
            {ready === 0 && wait !== undefined ? (
              <p
                className="text-center text-sm text-muted-foreground"
                data-testid="review-next"
              >
                {t("review.comeBack", { in: formatInterval(wait, t) })}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Quick amounts next to the field of "Study more today"; the last chip always takes everything that is held. */
const MORE_STEPS = [5, 10, 20, 50];

/** The number in a text field when it is a whole number from 1 to max; undefined when it is not. */
function parseMore(text: string, max: number): number | undefined {
  const n = Number(text);
  return text.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= max
    ? n
    : undefined;
}

/**
 * "Study more today": the daily limits hold some cards back; the user picks how many of each kind to let through
 * for the next 24 hours. The settings stay as they are.
 */
function StudyMore({
  newHeld,
  dueHeld,
  capped,
  onMore,
}: {
  newHeld: number;
  dueHeld: number;
  /** A count stopped at its cap: it is a lower bound ("10000+"). */
  capped: boolean;
  onMore: (newWords: number, reviews: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [newText, setNewText] = useState(String(Math.min(newHeld, 10)));
  const [dueText, setDueText] = useState(String(Math.min(dueHeld, 10)));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  // a kind with nothing held has no field; an empty field asks for none of that kind
  const newOk =
    newHeld === 0 ||
    newText.trim() === "" ||
    parseMore(newText, newHeld) !== undefined;
  const dueOk =
    dueHeld === 0 ||
    dueText.trim() === "" ||
    parseMore(dueText, dueHeld) !== undefined;
  const newWords = newHeld > 0 ? (parseMore(newText, newHeld) ?? 0) : 0;
  const reviews = dueHeld > 0 ? (parseMore(dueText, dueHeld) ?? 0) : 0;
  const valid = newOk && dueOk && newWords + reviews > 0;

  async function submit() {
    setBusy(true);
    try {
      await onMore(newWords, reviews);
      setError(undefined);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const field = (
    id: string,
    label: string,
    held: number,
    text: string,
    setText: (v: string) => void,
    ok: boolean,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={held}
          step={1}
          value={text}
          className="max-w-28"
          aria-invalid={!ok || undefined}
          onChange={(e) => setText(e.target.value)}
        />
        <span className="text-sm text-muted-foreground">
          {t("review.moreHeld", { count: held })}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[...MORE_STEPS.filter((n) => n < held), held].map((n) => (
          <Button
            key={n}
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => setText(String(n))}
          >
            {n === held ? t("review.moreAll", { count: n }) : `+${n}`}
          </Button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-3 pt-2 text-left" data-testid="review-more">
      <p className="text-center text-sm text-muted-foreground">
        {t("review.moreWaiting", {
          new: formatCount(newHeld, capped),
          due: formatCount(dueHeld, capped),
        })}
      </p>
      {open ? (
        <div className="space-y-3 border-t pt-3">
          <h3 className="font-medium">{t("review.moreTitle")}</h3>
          {error ? <Alert variant="destructive">{errorMessage(error, t)}</Alert> : null}
          {newHeld > 0
            ? field(
                "more-new",
                t("review.moreNew"),
                newHeld,
                newText,
                setNewText,
                newOk,
              )
            : null}
          {dueHeld > 0
            ? field(
                "more-reviews",
                t("review.moreReviews"),
                dueHeld,
                dueText,
                setDueText,
                dueOk,
              )
            : null}
          <p className="text-xs text-muted-foreground">
            {t("review.moreHint")}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={busy || !valid}
              onClick={() => void submit()}
            >
              {t("review.moreAction")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            {t("review.moreOpen")}
          </Button>
        </div>
      )}
    </div>
  );
}
