import type { Word } from "./api";
import { PLACEHOLDER_UK, PLACEHOLDER_US } from "./lib/cardHtml";

// Builds the card of a word the way it is saved and exported: the front is the word, the back is HTML.
// Keep the placeholders in line with dictionary/internal/anki (the service turns them into sound tags).
export { PLACEHOLDER_UK, PLACEHOLDER_US } from "./lib/cardHtml";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface CardOptions {
  /**
   * Put the audio placeholders after the phonetics (the card that is saved: the service replaces them with
   * sound tags). Without them the card is the one to paste into Anki by hand, where they would show as text.
   */
  placeholders: boolean;
  /** Default true. The second dictionary of a combined card leaves its phonetics out (the first one has them). */
  phonetics?: boolean;
}

function phoneticLine(w: Word, o: CardOptions): string {
  const parts: string[] = [];
  const uk = w.phoneticUk || (!w.phoneticUs ? w.phonetic : "");
  const us = w.phoneticUs;
  if (uk || w.audioUk)
    parts.push(
      `UK ${escapeHtml(uk)}${o.placeholders && w.audioUk ? ` ${PLACEHOLDER_UK}` : ""}`.trim(),
    );
  if (us || w.audioUs)
    parts.push(
      `US ${escapeHtml(us)}${o.placeholders && w.audioUs ? ` ${PLACEHOLDER_US}` : ""}`.trim(),
    );
  return parts.join(" &nbsp; ");
}

/** The back of the card (HTML, one line: it is also pasted into a tab separated import). */
export function cardBack(
  w: Word,
  o: CardOptions = { placeholders: true },
): string {
  const html: string[] = [];
  const phon = o.phonetics === false ? "" : phoneticLine(w, o);
  if (phon) html.push(`<div>${phon}</div>`);
  if (w.partOfSpeech.length > 0)
    html.push(`<div><i>${w.partOfSpeech.map(escapeHtml).join(", ")}</i></div>`);
  if (w.meanings.length > 0) {
    const items = w.meanings.map((m) => {
      const ex =
        m.examples.length > 0
          ? `<ul>${m.examples.map((e) => `<li><i>${escapeHtml(e)}</i></li>`).join("")}</ul>`
          : "";
      return `<li>${escapeHtml(m.definition)}${ex}</li>`;
    });
    html.push(`<ol>${items.join("")}</ol>`);
  }
  return html.join("");
}

/** Rule between the dictionaries on the back of a saved card. */
export const DICTIONARY_SEPARATOR = "<hr>";

/** The part of a saved card that one dictionary gives. `first`: no part comes before it. */
export type PartRenderer = (w: Word, first: boolean) => string;

/** The part of a saved card that comes from the English dictionary. */
export function enPart(en: Word): string {
  return cardBack(en, { placeholders: true });
}

/** The part from the English-Vietnamese dictionary; with an English part before it, it leaves the phonetics out. */
export function viPart(vi: Word, hasEn: boolean): string {
  return cardBack(
    vi,
    hasEn ? { placeholders: false, phonetics: false } : { placeholders: true },
  );
}

/**
 * The part of a dictionary that has no renderer of its own: the phonetics and the audio placeholders come once,
 * from the first part of the card, the parts after it leave them out.
 */
export const genericPart: PartRenderer = (w, first) =>
  viPart(w, !first);

/**
 * Renderers by dictionary id. A dictionary of the registry needs no entry here: its part is made by `genericPart`.
 * Add one when a dictionary needs its own layout.
 */
export const partRenderers: Record<string, PartRenderer> = {
  english: (w) => enPart(w),
  "english-vietnamese": (w, first) => viPart(w, !first),
};

/** The part of a saved card of the dictionary `id`. */
export function renderPart(id: string, w: Word, first: boolean): string {
  return (partRenderers[id] ?? genericPart)(w, first);
}

/** What one dictionary gives to a card: its entry, or the HTML of an edit that replaces the entry. */
export interface CardPart {
  id: string;
  word?: Word;
  html?: string;
}

/**
 * The back of a saved card: the parts in the order given (the registry's), a rule between them. A dictionary
 * with no entry and no edit is left out.
 */
export function combinedCardBack(parts: CardPart[]): string {
  const out: string[] = [];
  for (const p of parts) {
    const first = out.every((h) => h === "");
    out.push(
      p.html ?? (p.word ? renderPart(p.id, p.word, first) : ""),
    );
  }
  return joinParts(out);
}

/** The parts with a rule between them; an empty part is left out. */
export function joinParts(parts: string[]): string {
  return parts.filter((p) => p !== "").join(DICTIONARY_SEPARATOR);
}

/** What a manual add or a tab separated import of Anki takes: front, a tab, the back. */
export function cardText(w: Word): string {
  return `${w.text}\t${cardBack(w, { placeholders: false })}`;
}

/** Several cards: one line each in the text, a rule between them in the HTML. */
export function cardsText(words: Word[]): string {
  return words.map(cardText).join("\n");
}

export function cardsHtml(words: Word[]): string {
  return words
    .map(
      (w) =>
        `<div><b>${escapeHtml(w.text)}</b></div>${cardBack(w, { placeholders: false })}`,
    )
    .join("<hr>");
}

/** Puts HTML and text on the clipboard together (the text alone where rich content is not allowed). */
export async function copyRich(html: string, text: string): Promise<void> {
  const clip = navigator.clipboard;
  if (!clip) throw new Error("clipboard unavailable");
  if (typeof ClipboardItem !== "undefined" && clip.write) {
    try {
      await clip.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // some browsers refuse rich content: the text still goes
    }
  }
  await clip.writeText(text);
}
