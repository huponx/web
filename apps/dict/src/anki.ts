import type { Word } from "./api";

// Builds the card of a word the way it is saved and exported: the front is the word, the back is HTML.
// Keep the placeholders in line with dictionary/internal/anki (the service turns them into sound tags).
export const PLACEHOLDER_UK = "replace_audio_uk";
export const PLACEHOLDER_US = "replace_audio_us";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  if (uk || w.audioUk) parts.push(`UK ${escapeHtml(uk)}${o.placeholders && w.audioUk ? ` ${PLACEHOLDER_UK}` : ""}`.trim());
  if (us || w.audioUs) parts.push(`US ${escapeHtml(us)}${o.placeholders && w.audioUs ? ` ${PLACEHOLDER_US}` : ""}`.trim());
  return parts.join(" &nbsp; ");
}

/** The back of the card (HTML, one line: it is also pasted into a tab separated import). */
export function cardBack(w: Word, o: CardOptions = { placeholders: true }): string {
  const html: string[] = [];
  const phon = o.phonetics === false ? "" : phoneticLine(w, o);
  if (phon) html.push(`<div>${phon}</div>`);
  if (w.partOfSpeech.length > 0) html.push(`<div><i>${w.partOfSpeech.map(escapeHtml).join(", ")}</i></div>`);
  if (w.meanings.length > 0) {
    const items = w.meanings.map((m) => {
      const ex = m.examples.length > 0 ? `<ul>${m.examples.map((e) => `<li><i>${escapeHtml(e)}</i></li>`).join("")}</ul>` : "";
      return `<li>${escapeHtml(m.definition)}${ex}</li>`;
    });
    html.push(`<ol>${items.join("")}</ol>`);
  }
  return html.join("");
}

/** Rule between the two dictionaries on the back of a saved card. */
export const DICTIONARY_SEPARATOR = "<hr>";

/**
 * The back of a saved card: the English entry first, a rule, then the English-Vietnamese entry. Whichever
 * entry is missing is left out. The phonetics and the audio placeholders come once, from the English entry
 * (or from the Vietnamese one when there is no English one).
 */
export function combinedCardBack(en: Word | undefined, vi: Word | undefined): string {
  if (en && vi) return cardBack(en, { placeholders: true }) + DICTIONARY_SEPARATOR + cardBack(vi, { placeholders: false, phonetics: false });
  const only = en ?? vi;
  return only ? cardBack(only, { placeholders: true }) : "";
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
  return words.map((w) => `<div><b>${escapeHtml(w.text)}</b></div>${cardBack(w, { placeholders: false })}`).join("<hr>");
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
