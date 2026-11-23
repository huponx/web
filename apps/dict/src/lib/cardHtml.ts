// The back of a saved card is HTML that the browser stored for itself, but the service keeps whatever it is sent,
// so it is never put on the page as it is: only the tags of a card survive, without attributes.
const ALLOWED = new Set(["DIV", "SPAN", "P", "BR", "HR", "B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "SMALL", "SUB", "SUP"]);
// elements whose content is not text for the reader at all
const DROPPED = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT", "SVG", "MATH", "AUDIO", "VIDEO"]);

function clean(node: Node, doc: Document): Node {
  const out = doc.createDocumentFragment();
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out.appendChild(doc.createTextNode(child.textContent ?? ""));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toUpperCase();
      if (DROPPED.has(tag)) return;
      if (ALLOWED.has(tag)) {
        const copy = doc.createElement(tag.toLowerCase());
        copy.appendChild(clean(el, doc));
        out.appendChild(copy);
      } else {
        out.appendChild(clean(el, doc)); // an unknown tag: its text stays
      }
    }
  });
  return out;
}

/** The back of a card as safe HTML to show: the audio placeholders are gone, only the tags of a card are kept. */
export function cardHtml(content: string): string {
  const withoutAudio = content.replace(/replace_audio_(uk|us)/g, "");
  // a document that is never attached to the page: nothing in it runs or loads
  const parsed = new DOMParser().parseFromString(withoutAudio, "text/html");
  const holder = parsed.createElement("div");
  holder.appendChild(clean(parsed.body, parsed));
  return holder.innerHTML;
}
