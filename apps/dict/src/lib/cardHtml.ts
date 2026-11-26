// The back of a saved card is HTML that the browser stored for itself, but the service keeps whatever it is sent,
// so it is never put on the page as it is: only the tags of a card survive, without attributes. The one exception
// is an image of the card: <img src="dictimg:<uuid>"> (the file lives in the service, see api.ts), nothing else.
const VIEW_TAGS = [
  "DIV",
  "SPAN",
  "P",
  "BR",
  "HR",
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "UL",
  "OL",
  "LI",
  "SMALL",
  "SUB",
  "SUP",
  "IMG",
];
// what the editor knows (and so what a saved card holds after an edit)
const EDITOR_TAGS = [
  "P",
  "BR",
  "HR",
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "UL",
  "OL",
  "LI",
  "IMG",
];
// elements whose content is not text for the reader at all
const DROPPED = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "TEMPLATE",
  "NOSCRIPT",
  "SVG",
  "MATH",
  "AUDIO",
  "VIDEO",
]);

/** The reference of an image in a card; keep in line with dictionary/internal/imagestore. */
export const IMAGE_REF =
  /^dictimg:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export const IMAGE_SCHEME = "dictimg:";

export const MIN_IMAGE_WIDTH = 24;
export const MAX_IMAGE_WIDTH = 2000;

/** The width in pixels an image of a card may carry; none when it is not a whole number in range. */
export function imageWidth(v: string | null | undefined): number | undefined {
  if (!v || !/^\d{1,4}$/.test(v)) return undefined;
  const n = Number(v);
  return n >= MIN_IMAGE_WIDTH && n <= MAX_IMAGE_WIDTH ? n : undefined;
}

export const PLACEHOLDER_UK = "replace_audio_uk";
export const PLACEHOLDER_US = "replace_audio_us";

interface Mode {
  allowed: Set<string>;
  /** A div is a paragraph for the editor. */
  divToP?: boolean;
}

const VIEW: Mode = { allowed: new Set(VIEW_TAGS) };
const EDITOR: Mode = { allowed: new Set(EDITOR_TAGS), divToP: true };

function clean(node: Node, doc: Document, mode: Mode): Node {
  const out = doc.createDocumentFragment();
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out.appendChild(doc.createTextNode(child.textContent ?? ""));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toUpperCase();
      if (DROPPED.has(tag)) return;
      if (tag === "IMG") {
        const src = el.getAttribute("src") ?? "";
        if (IMAGE_REF.test(src)) {
          const img = doc.createElement("img");
          img.setAttribute("src", src);
          const width = imageWidth(el.getAttribute("width"));
          if (width) img.setAttribute("width", String(width));
          out.appendChild(img);
        }
        return; // any other image (a link to a foreign host, javascript:) is gone
      }
      const target = mode.divToP && tag === "DIV" ? "P" : tag;
      if (mode.allowed.has(target)) {
        const copy = doc.createElement(target.toLowerCase());
        copy.appendChild(clean(el, doc, mode));
        out.appendChild(copy);
      } else {
        out.appendChild(clean(el, doc, mode)); // an unknown tag: its text stays
      }
    }
  });
  return out;
}

function sanitize(html: string, mode: Mode): HTMLElement {
  // a document that is never attached to the page: nothing in it runs or loads
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const holder = parsed.createElement("div");
  holder.appendChild(clean(parsed.body, parsed, mode));
  return holder;
}

const SLOT_RE = /@@AUDIO_(UK|US)@@/g;

/** The back of a card as safe HTML to show: the audio placeholders are gone, only the tags of a card are kept. */
export function cardHtml(content: string): string {
  return sanitize(content.replace(/replace_audio_(uk|us)/g, ""), VIEW)
    .innerHTML;
}

/** The ids of the images a card shows. */
export function imageIds(content: string): string[] {
  const ids = new Set<string>();
  for (const m of content.matchAll(/dictimg:([0-9a-f-]{36})/g)) ids.add(m[1]!);
  return [...ids];
}

/** Safe HTML of a card for the page: the images carry data-dictimg (an element loads it later) instead of a src, and
 * the audio placeholders are empty `span[data-audio-slot]` where the page puts the play buttons. */
export function cardViewHtml(content: string): string {
  const marked = content.replace(
    /replace_audio_(uk|us)/g,
    (_m, k: string) => `@@AUDIO_${k.toUpperCase()}@@`,
  );
  return sanitize(marked, VIEW)
    .innerHTML.replace(
      SLOT_RE,
      (_m, k: string) => `<span data-audio-slot="${k.toLowerCase()}"></span>`,
    )
    .replace(
      /<img src="dictimg:([0-9a-f-]{36})"( width="\d+")?>/g,
      '<img data-dictimg="$1"$2 alt="">',
    );
}

/** Whether the card says where the UK or US audio plays. */
export function hasAudioSlot(content: string, kind: "uk" | "us"): boolean {
  return content.includes(kind === "us" ? PLACEHOLDER_US : PLACEHOLDER_UK);
}

/** The card as the editor reads it: audio placeholders become chips, divs become paragraphs, the rest is cleaned. */
export function toEditorHtml(content: string): string {
  const marked = content.replace(
    /replace_audio_(uk|us)/g,
    (_m, k: string) => `@@AUDIO_${k.toUpperCase()}@@`,
  );
  return sanitize(marked, EDITOR).innerHTML.replace(
    SLOT_RE,
    (_m, k: string) => `<span data-audio-slot="${k.toLowerCase()}"></span>`,
  );
}

/** The HTML of the editor as the back of a card: chips are placeholders again, one line (it is also pasted into a tab separated import). */
export function fromEditorHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  // the editor writes an image as data-dictimg (see CardImage); the card holds it as src
  parsed.querySelectorAll("img[data-dictimg]").forEach((img) => {
    img.setAttribute(
      "src",
      `${IMAGE_SCHEME}${img.getAttribute("data-dictimg")}`,
    );
    img.removeAttribute("data-dictimg");
  });
  parsed.querySelectorAll("span[data-audio-slot]").forEach((s) => {
    s.replaceWith(
      parsed.createTextNode(
        s.getAttribute("data-audio-slot") === "us"
          ? PLACEHOLDER_US
          : PLACEHOLDER_UK,
      ),
    );
  });
  // the first paragraph of a list item is just the item
  parsed
    .querySelectorAll("li > p:first-child")
    .forEach((p) => p.replaceWith(...Array.from(p.childNodes)));
  const out = sanitize(parsed.body.innerHTML, {
    allowed: EDITOR.allowed,
  }).innerHTML;
  return out.replace(/[\r\n]+/g, "");
}
