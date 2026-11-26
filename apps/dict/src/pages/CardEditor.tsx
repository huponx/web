import { Alert, Button } from "@huponx/ui-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  Bold,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Minus,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { escapeHtml } from "../anki";
import { useDictionary } from "../api";
import {
  fromEditorHtml,
  PLACEHOLDER_UK,
  PLACEHOLDER_US,
  toEditorHtml,
} from "../lib/cardHtml";
import { audioRef, isAudioRef } from "../lib/audio";
import { normalizeAudioInput, probeAudio } from "../lib/audioUrl";
import { formatBytes } from "../lib/bytes";
import { errorMessage, Localized } from "../lib/errors";
import { useSettings } from "../lib/settings";
import AudioField from "./AudioField";
import { cardExtensions } from "./cardExtensions";

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
  /** The editor sits in a scrolling dialog: the Cancel / Apply row stays at the bottom of it. */
  stickyActions?: boolean;
  /** Applying an editor with no text, image or audio is refused (a card written from nothing). */
  requireContent?: boolean;
}

function audioOk(url: string): boolean {
  if (url === "" || isAudioRef(url)) return true;
  if (url.length > MAX_AUDIO) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

const isImage = (f: File | null | undefined): f is File =>
  !!f && f.type.startsWith("image/");

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

/** Rich text editor of the back of a card (bold, lists, images from a file, a drop or the clipboard) and its two audio fields (a URL, or an uploaded file). */
export default function CardEditor({
  initialContent,
  initialAudio,
  saving = false,
  applyLabel,
  onApply,
  onCancel,
  stickyActions = false,
  requireContent = false,
}: CardEditorProps) {
  const { t } = useTranslation();
  const api = useDictionary();
  // what the service takes of a card (content): the setting of the administrators
  const maxContentBytes = useSettings().settings.system.maxContentBytes;
  const [audioUk, setAudioUk] = useState(initialAudio.audioUk);
  const [audioUs, setAudioUs] = useState(initialAudio.audioUs);
  const [pending, setPending] = useState(0);
  // the audio field that is sending a file
  const [uploadingAudio, setUploadingAudio] = useState<"uk" | "us">();
  // the audio addresses are being checked; the ones that did not load and that the user chose to keep
  const [checking, setChecking] = useState(false);
  const keepAudio = useRef(new Set<string>());
  const [error, setError] = useState<unknown>();
  const fileInput = useRef<HTMLInputElement>(null);
  // the editor is made once: its handlers read the current functions from here
  const insertFiles = useRef<(files: File[], pos?: number) => void>(
    () => undefined,
  );
  const applyRef = useRef<() => void | Promise<void>>(() => undefined);
  const pendingRef = useRef(0);
  const extensions = useMemo(() => cardExtensions(api.imageUrl), [api]);

  const editor = useEditor({
    extensions,
    content: toEditorHtml(initialContent),
    injectCSS: false,
    editorProps: {
      attributes: {
        "aria-label": t("editor.label"),
        role: "textbox",
        "aria-multiline": "true",
      },
      // Ctrl+Enter (Cmd+Enter) applies, before the editor turns it into a line break
      handleKeyDown: (_view, event) => {
        if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey))
          return false;
        event.preventDefault();
        if (pendingRef.current === 0) void applyRef.current();
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
          editor?.commands.insertContent(
            escapeHtml(text).replace(/\r?\n/g, "<br>"),
          );
          return true;
        }
        if (/<img\b/i.test(data.getData("text/html")))
          setError(new Localized("editor.imageUnreadable"));
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter(
          isImage,
        );
        if (files.length === 0) return false;
        event.preventDefault();
        insertFiles.current(
          files,
          view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos,
        );
        return true;
      },
    },
  });

  insertFiles.current = (files, pos) => {
    if (!editor) return;
    let at = pos;
    for (const f of files) {
      setPending((n) => n + 1);
      api
        .uploadImage(f)
        .then((id) => {
          setError(undefined);
          const node = { type: "image", attrs: { src: `dictimg:${id}` } };
          if (at !== undefined)
            editor.chain().focus().insertContentAt(at, node).run();
          else editor.chain().focus().insertContent(node).run();
          at = undefined;
        })
        .catch((e) => setError(e))
        .finally(() => setPending((n) => n - 1));
    }
  };

  useEffect(() => () => editor?.destroy(), [editor]);

  function uploadAudio(kind: "uk" | "us", file: File) {
    setPending((n) => n + 1);
    setUploadingAudio(kind);
    api
      .uploadAudio(file)
      .then((id) => {
        setError(undefined);
        (kind === "uk" ? setAudioUk : setAudioUs)(audioRef(id));
      })
      .catch((e) => setError(e))
      .finally(() => {
        setPending((n) => n - 1);
        setUploadingAudio(undefined);
      });
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    insertFiles.current(files);
  }

  /**
   * The first address that does not load, as the region it is for; an address that was not changed, or that the
   * user kept after the warning, is not asked again.
   */
  async function missingAudio(
    uk: string,
    us: string,
  ): Promise<string | undefined> {
    const todo = [
      { region: t("lookup.uk"), url: uk, was: initialAudio.audioUk },
      { region: t("lookup.us"), url: us, was: initialAudio.audioUs },
    ].filter(
      (a) =>
        a.url &&
        !isAudioRef(a.url) &&
        a.url !== a.was &&
        !keepAudio.current.has(a.url),
    );
    const results = await Promise.all(todo.map((a) => probeAudio(a.url)));
    const i = results.findIndex((r) => r === false);
    if (i < 0) return undefined;
    keepAudio.current.add(todo[i]!.url);
    return todo[i]!.region;
  }

  async function apply() {
    if (!editor || checking) return;
    const uk = isAudioRef(audioUk) ? audioUk : normalizeAudioInput(audioUk);
    const us = isAudioRef(audioUs) ? audioUs : normalizeAudioInput(audioUs);
    setAudioUk(uk);
    setAudioUs(us);
    if (!audioOk(uk) || !audioOk(us)) return setError(new Localized("editor.badAudio"));
    setChecking(true);
    let missing: string | undefined;
    try {
      missing = await missingAudio(uk, us);
    } finally {
      setChecking(false);
    }
    // the next Apply keeps the address, in case the file plays for the user and not for the check
    if (missing) return setError(new Localized("editor.audioMissing", { region: missing }));
    setError(undefined);
    let content = fromEditorHtml(editor.getHTML());
    // a sound tag without an address would play nothing
    if (!uk) content = content.split(PLACEHOLDER_UK).join("");
    if (!us) content = content.split(PLACEHOLDER_US).join("");
    if (
      requireContent &&
      !uk &&
      !us &&
      !/<(img|audio)\b/i.test(content) &&
      content.replace(/<[^>]*>|&nbsp;/g, "").trim() === ""
    )
      return setError(new Localized("editor.empty"));
    if (new Blob([content]).size > maxContentBytes)
      return setError(
        new Localized("editor.tooLarge", { limit: formatBytes(maxContentBytes) }),
      );
    onApply({ content, audioUk: uk, audioUs: us });
  }

  applyRef.current = apply;
  pendingRef.current = pending;
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // the audio fields: the editor handles its own
    if (
      e.key === "Enter" &&
      (e.ctrlKey || e.metaKey) &&
      !(e.target as HTMLElement).closest(".ProseMirror")
    ) {
      e.preventDefault();
      if (pending === 0) void apply();
    }
  }

  const tool = (
    label: string,
    icon: React.ReactNode,
    run: () => void,
    active = false,
    disabled = false,
  ) => (
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
    <div
      className={stickyActions ? "flex min-h-0 flex-1 flex-col" : "space-y-3"}
      data-testid="card-editor"
      onKeyDown={onKeyDown}
    >
      {/* in a dialog only this part scrolls; the action row below it stays put */}
      <div
        className={
          stickyActions
            ? "min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4"
            : "space-y-3"
        }
      >
        <div className="rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring">
          <div
            role="toolbar"
            aria-label={t("editor.toolbar")}
            className="flex flex-wrap items-center gap-0.5 border-b border-input p-1"
          >
            {tool(
              t("editor.bold"),
              <Bold aria-hidden="true" />,
              () => chain()?.toggleBold().run(),
              editor?.isActive("bold"),
            )}
            {tool(
              t("editor.italic"),
              <Italic aria-hidden="true" />,
              () => chain()?.toggleItalic().run(),
              editor?.isActive("italic"),
            )}
            {tool(
              t("editor.underline"),
              <Underline aria-hidden="true" />,
              () => chain()?.toggleUnderline().run(),
              editor?.isActive("underline"),
            )}
            {tool(
              t("editor.bullets"),
              <List aria-hidden="true" />,
              () => chain()?.toggleBulletList().run(),
              editor?.isActive("bulletList"),
            )}
            {tool(
              t("editor.numbers"),
              <ListOrdered aria-hidden="true" />,
              () => chain()?.toggleOrderedList().run(),
              editor?.isActive("orderedList"),
            )}
            {tool(t("editor.rule"), <Minus aria-hidden="true" />, () =>
              chain()?.setHorizontalRule().run(),
            )}
            {tool(t("editor.undo"), <Undo2 aria-hidden="true" />, () =>
              chain()?.undo().run(),
            )}
            {tool(t("editor.redo"), <Redo2 aria-hidden="true" />, () =>
              chain()?.redo().run(),
            )}
            {tool(t("editor.image"), <ImagePlus aria-hidden="true" />, () =>
              fileInput.current?.click(),
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              aria-label={t("editor.image")}
              onChange={onPick}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                chain()
                  ?.insertContent({ type: "audioSlot", attrs: { kind: "uk" } })
                  .run()
              }
            >
              {t("editor.insertUk")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                chain()
                  ?.insertContent({ type: "audioSlot", attrs: { kind: "us" } })
                  .run()
              }
            >
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
          <AudioField
            id="audio-uk"
            label={t("editor.audioUk")}
            region={t("lookup.uk")}
            value={audioUk}
            onChange={setAudioUk}
            onUpload={(f) => uploadAudio("uk", f)}
            uploading={uploadingAudio === "uk"}
          />
          <AudioField
            id="audio-us"
            label={t("editor.audioUs")}
            region={t("lookup.us")}
            value={audioUs}
            onChange={setAudioUs}
            onUpload={(f) => uploadAudio("us", f)}
            uploading={uploadingAudio === "us"}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("editor.audioHint")}</p>
        {error ? <Alert variant="destructive">{errorMessage(error, t)}</Alert> : null}
      </div>
      <div
        className={
          stickyActions
            ? "flex justify-end gap-2 border-t bg-popover px-6 py-3"
            : "flex justify-end gap-2"
        }
      >
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          {t("editor.cancel")}
        </Button>
        <Button
          type="button"
          busy={saving || checking}
          disabled={pending > 0}
          onClick={() => void apply()}
        >
          {applyLabel}
        </Button>
      </div>
    </div>
  );
}
