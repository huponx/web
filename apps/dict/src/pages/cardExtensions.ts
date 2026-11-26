import { mergeAttributes, Node } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import BulletList from "@tiptap/extension-bullet-list";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import History from "@tiptap/extension-history";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Italic from "@tiptap/extension-italic";
import ListItem from "@tiptap/extension-list-item";
import OrderedList from "@tiptap/extension-ordered-list";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Underline from "@tiptap/extension-underline";
import { NodeSelection } from "@tiptap/pm/state";
import {
  IMAGE_REF,
  imageWidth,
  MAX_IMAGE_WIDTH,
  MIN_IMAGE_WIDTH,
} from "../lib/cardHtml";

/** An image of the card: only a reference `dictimg:<uuid>`; the view shows the blob URL `resolve` gives. */
export const CardImage = Node.create<{
  resolve: (id: string) => Promise<string>;
}>({
  name: "image",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,
  addOptions() {
    return { resolve: () => Promise.reject(new Error("no resolver")) };
  },
  addAttributes() {
    return { src: { default: null }, width: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: "img[data-dictimg]",
        getAttrs: (el) => ({
          src: `dictimg:${(el as HTMLElement).getAttribute("data-dictimg")}`,
          width: imageWidth((el as HTMLElement).getAttribute("width")) ?? null,
        }),
      },
      {
        tag: "img[src]",
        getAttrs: (el) =>
          IMAGE_REF.test((el as HTMLElement).getAttribute("src") ?? "")
            ? {
                width:
                  imageWidth((el as HTMLElement).getAttribute("width")) ?? null,
              }
            : false,
      },
    ];
  },
  // no src: the editor builds this element in the page itself, where a dictimg: address would be fetched and fail
  renderHTML({ HTMLAttributes }) {
    const attrs: Record<string, string> = {
      "data-dictimg": String(HTMLAttributes.src).replace(/^dictimg:/, ""),
    };
    if (HTMLAttributes.width) attrs.width = String(HTMLAttributes.width);
    return ["img", mergeAttributes(attrs)];
  },
  addNodeView() {
    const { resolve } = this.options;
    return ({ node, view, getPos }) => {
      const dom = document.createElement("span");
      dom.className = "card-image-wrap";
      const img = document.createElement("img");
      img.alt = "";
      img.className = "card-image";
      if (node.attrs.width) img.width = Number(node.attrs.width);
      const handle = document.createElement("span");
      handle.className = "card-image-handle";
      dom.append(img, handle);
      const m = IMAGE_REF.exec(String(node.attrs.src));
      if (m)
        resolve(m[1]!)
          .then((url) => (img.src = url))
          .catch(() => undefined);

      // a tap anywhere on the image selects it (the default caret placement misses small touch targets)
      dom.addEventListener("click", (e) => {
        if (e.target === handle) return;
        const pos = getPos();
        if (pos === undefined) return;
        view.dispatch(
          view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)),
        );
        view.focus();
      });

      // drag the bottom-right corner (mouse or touch): live preview, one transaction on release
      let startX = 0;
      let startWidth = 0;
      let width = 0;
      let dragging = false;
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture?.(e.pointerId);
        dragging = true;
        startX = e.clientX;
        startWidth = img.offsetWidth;
        width = startWidth;
      });
      handle.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const max = Math.min(
          MAX_IMAGE_WIDTH,
          dom.parentElement?.clientWidth || MAX_IMAGE_WIDTH,
        );
        width = Math.max(
          MIN_IMAGE_WIDTH,
          Math.min(max, Math.round(startWidth + (e.clientX - startX))),
        );
        img.width = width;
      });
      const end = () => {
        if (!dragging) return;
        dragging = false;
        const pos = getPos();
        if (pos === undefined) return;
        view.dispatch(
          view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width }),
        );
      };
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);

      return {
        dom,
        selectNode: () => dom.classList.add("is-selected"),
        deselectNode: () => dom.classList.remove("is-selected"),
        stopEvent: (e) => e.target === handle,
      };
    };
  },
});

/** The place where UK or US audio plays (the placeholder replace_audio_uk / replace_audio_us of the saved card). */
export const AudioSlot = Node.create({
  name: "audioSlot",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { kind: { default: "uk" } };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-audio-slot]",
        getAttrs: (el) => ({
          kind:
            (el as HTMLElement).getAttribute("data-audio-slot") === "us"
              ? "us"
              : "uk",
        }),
      },
    ];
  },
  renderHTML({ node }) {
    const kind = node.attrs.kind === "us" ? "us" : "uk";
    return [
      "span",
      { "data-audio-slot": kind, class: "audio-slot" },
      `${kind.toUpperCase()} ▶`,
    ];
  },
});

export const cardExtensions = (resolve: (id: string) => Promise<string>) => [
  Document,
  Paragraph,
  Text,
  Bold,
  Italic,
  Underline,
  BulletList,
  OrderedList,
  ListItem,
  HardBreak,
  HorizontalRule,
  History,
  CardImage.configure({ resolve }),
  AudioSlot,
];
