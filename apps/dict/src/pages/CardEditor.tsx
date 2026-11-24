import { Alert, Button, Input, Label } from "@huponx/ui-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { Bold, ImagePlus, Italic, List, ListOrdered, Minus, Redo2, Underline, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { escapeHtml } from "../anki";
import { useDictionary } from "../api";
import { fromEditorHtml, PLACEHOLDER_UK, PLACEHOLDER_US, toEditorHtml } from "../lib/cardHtml";
import { errorMessage } from "../lib/errors";
import { cardExtensions } from "./cardExtensions";

/** What the service takes of a card (content). */
export const MAX_CONTENT_BYTES = 64 * 1024;
const MAX_AUDIO = 500;

export interface CardEdit {
  content: string;
  audioUk: string;
  audioUs: string;
}

export interface CardEditorProps {
  initialContent: string;
  initialAudio: { audioUk: string; audioUs: string };
  saving?: boolean;
  /** The label of the button that takes the edit: "Save" or "Apply". */
  applyLabel: string;
  onApply: (edit: CardEdit) => void;
  onCancel: () => void;
}

function audioOk(url: string): boolean {
  if (url === "") return true;
  if (url.length > MAX_AUDIO) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

const isImage = (f: File | null | undefined): f is File => !!f && f.type.startsWith("image/");

// the editor styles itself (the page CSP forbids injected <style>): the tokens of the kit, no colours of its own
const PROSE =
  "[&_.ProseMirror]:min-h-32 [&_.ProseMirror]:px-3 [&_.ProseMirror]:py-2 [&_.ProseMirror]:text-sm [&_.ProseMirror]:[@media(pointer:coarse)]:text-base [&_.ProseMirror]:outline-none " +
  "[&_.ProseMirror_p]:my-1 [&_.ProseMirror_hr]:my-2 [&_.ProseMirror_hr]:border-border [&_.ProseMirror_i]:italic " +
  "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_li]:my-0.5 " +
  "[&_.ProseMirror_img]:inline-block [&_.ProseMirror_img]:h-auto [&_.ProseMirror_img]:max-h-64 [&_.ProseMirror_img[width]]:max-h-none [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:rounded-md [&_.ProseMirror_img]:bg-muted [&_.ProseMirror_img]:min-h-6 [&_.ProseMirror_img]:min-w-6 " +
  "[&_.ProseMirror-selectednode]:ring-2 [&_.ProseMirror-selectednode]:ring-ring " +
  "[&_.card-image-wrap]:relative [&_.card-image-wrap]:inline-block [&_.card-image-wrap]:max-w-full [&_.card-image-wrap]:align-bottom " +
  "[&_.card-image-handle]:absolute [&_.card-image-handle]:right-0 [&_.card-image-handle]:bottom-0 [&_.card-image-handle]:hidden [&_.card-image-handle]:size-3.5 [&_.card-image-handle]:touch-none [&_.card-image-handle]:cursor-nwse-resize " +
  "[&_.card-image-handle]:rounded-sm [&_.card-image-handle]:border-2 [&_.card-image-handle]:border-background [&_.card-image-handle]:bg-primary [&_.card-image-handle]:[@media(pointer:coarse)]:size-6 " +
  "[&_.is-selected_.card-image-handle]:block [&_.card-image-handle]:[@media(pointer:coarse)]:block " +
  "[&_.audio-slot]:mx-0.5 [&_.audio-slot]:inline-block [&_.audio-slot]:rounded-md [&_.audio-slot]:border [&_.audio-slot]:bg-muted [&_.audio-slot]:px-1.5 [&_.audio-slot]:text-xs [&_.audio-slot]:text-muted-foreground";

/** Rich text editor of the back of a card (bold, lists, images from a file, a drop or the clipboard) and its two audio URLs. */
export default function CardEditor({ initialContent, initialAudio, saving = false, applyLabel, onApply, onCancel }: CardEditorProps) {
  const { t } = useTranslation();
  const api = useDictionary();
  const [audioUk, setAudioUk] = useState(initialAudio.audioUk);
  const [audioUs, setAudioUs] = useState(initialAudio.audioUs);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  // the editor is made once: its handlers read the current functions from here
  const insertFiles = useRef<(files: File[], pos?: number) => void>(() => undefined);
  const applyRef = useRef<() => void>(() => undefined);
  const pendingRef = useRef(0);
  const extensions = useMemo(() => cardExtensions(api.imageUrl), [api]);

  const editor = useEditor({
    extensions,
    content: toEditorHtml(initialContent),
    injectCSS: false,
    editorProps: {
      attributes: { "aria-label": t("editor.label"), role: "textbox", "aria-multiline": "true" },
      // Ctrl+Enter (Cmd+Enter) applies, before the editor turns it into a line break
      handleKeyDown: (_view, event) => {
        if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return false;
        event.preventDefault();
        if (pendingRef.current === 0) applyRef.current();
        return true;
      },
      handlePaste: (_view, event) => {
        const data = event.clipboardData;
        if (!data) return false;
        const files = Array.from(data.files).filter(isImage);
        if (files.length > 0) {
          insertFiles.current(files);
          return true;
        }
        const text = data.getData("text/plain");
        if (text) {
          // only the text of what was copied: foreign markup would bring styles, links and images that do not belong
          editor?.commands.insertContent(escapeHtml(text).replace(/\r?\n/g, "<br>"));
          return true;
        }
        if (/<img\b/i.test(data.getData("text/html"))) setError(t("editor.imageUnreadable"));
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter(isImage);
        if (files.length === 0) return false;
        event.preventDefault();
        insertFiles.current(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos);
        return true;
      },
    },
  });

  insertFiles.current = (files, pos) => {
    if (!editor) return;
    setError(undefined);
    let at = pos;
    for (const f of files) {
      setPending((n) => n + 1);
      api
        .uploadImage(f)
        .then((id) => {
          const node = { type: "image", attrs: { src: `dictimg:${id}` } };
          if (at !== undefined) editor.chain().focus().insertContentAt(at, node).run();
          else editor.chain().focus().insertContent(node).run();
          at = undefined;
        })
        .catch((e) => setError(errorMessage(e, t)))
        .finally(() => setPending((n) => n - 1));
    }
  };

  useEffect(() => () => editor?.destroy(), [editor]);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    insertFiles.current(files);
  }

  function apply() {
    if (!editor) return;
    if (!audioOk(audioUk.trim()) || !audioOk(audioUs.trim())) return setError(t("editor.badAudio"));
    const uk = audioUk.trim();
    const us = audioUs.trim();
    let content = fromEditorHtml(editor.getHTML());
    // a sound tag without an address would play nothing
    if (!uk) content = content.split(PLACEHOLDER_UK).join("");
    if (!us) content = content.split(PLACEHOLDER_US).join("");
    if (new Blob([content]).size > MAX_CONTENT_BYTES) return setError(t("editor.tooLarge"));
    onApply({ content, audioUk: uk, audioUs: us });
  }

  applyRef.current = apply;
  pendingRef.current = pending;
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // the audio fields: the editor handles its own
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !(e.target as HTMLElement).closest(".ProseMirror")) {
      e.preventDefault();
      if (pending === 0) apply();
    }
  }

  const tool = (label: string, icon: React.ReactNode, run: () => void, active = false, disabled = false) => (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {icon}
    </Button>
  );
  const chain = () => editor?.chain().focus();

  return (
    <div className="space-y-3" data-testid="card-editor" onKeyDown={onKeyDown}>
      <div className="rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring">
        <div role="toolbar" aria-label={t("editor.toolbar")} className="flex flex-wrap items-center gap-0.5 border-b border-input p-1">
          {tool(t("editor.bold"), <Bold aria-hidden="true" />, () => chain()?.toggleBold().run(), editor?.isActive("bold"))}
          {tool(t("editor.italic"), <Italic aria-hidden="true" />, () => chain()?.toggleItalic().run(), editor?.isActive("italic"))}
          {tool(t("editor.underline"), <Underline aria-hidden="true" />, () => chain()?.toggleUnderline().run(), editor?.isActive("underline"))}
          {tool(t("editor.bullets"), <List aria-hidden="true" />, () => chain()?.toggleBulletList().run(), editor?.isActive("bulletList"))}
          {tool(t("editor.numbers"), <ListOrdered aria-hidden="true" />, () => chain()?.toggleOrderedList().run(), editor?.isActive("orderedList"))}
          {tool(t("editor.rule"), <Minus aria-hidden="true" />, () => chain()?.setHorizontalRule().run())}
          {tool(t("editor.undo"), <Undo2 aria-hidden="true" />, () => chain()?.undo().run())}
          {tool(t("editor.redo"), <Redo2 aria-hidden="true" />, () => chain()?.redo().run())}
          {tool(t("editor.image"), <ImagePlus aria-hidden="true" />, () => fileInput.current?.click())}
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden aria-label={t("editor.image")} onChange={onPick} />
          <Button type="button" variant="ghost" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => chain()?.insertContent({ type: "audioSlot", attrs: { kind: "uk" } }).run()}>
            {t("editor.insertUk")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => chain()?.insertContent({ type: "audioSlot", attrs: { kind: "us" } }).run()}>
            {t("editor.insertUs")}
          </Button>
        </div>
        <EditorContent editor={editor} className={PROSE} />
      </div>
      {pending > 0 ? (
        <p role="status" className="text-xs text-muted-foreground">
          {t("editor.uploading")}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="audio-uk">{t("editor.audioUk")}</Label>
          <Input id="audio-uk" type="url" inputMode="url" value={audioUk} onChange={(e) => setAudioUk(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="audio-us">{t("editor.audioUs")}</Label>
          <Input id="audio-us" type="url" inputMode="url" value={audioUs} onChange={(e) => setAudioUs(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("editor.audioHint")}</p>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          {t("editor.cancel")}
        </Button>
        <Button type="button" busy={saving} disabled={pending > 0} onClick={apply}>
          {applyLabel}
        </Button>
      </div>
    </div>
  );
}
