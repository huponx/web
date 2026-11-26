import {
  Alert,
  AutoAlert,
  Button,
  Tip,
  Dialog,
  Dropdown,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  useConfirm,
} from "@huponx/ui-kit";
import { Check, Ellipsis, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  CATEGORY_COUNT_CAP,
  formatCount,
  UNCATEGORIZED,
  useDictionary,
} from "../api";
import { useSettings } from "../lib/settings";
import type { Category, CategoryList } from "../api";
import { notifySavedChanged } from "../lib/categories";
import { errorMessage } from "../lib/errors";

/** The select of a category filter: All, Uncategorized and one entry per category, each with its word count. */
export function CategoryFilter({
  id,
  label,
  value,
  onChange,
  list,
  allCount,
  hideAll = false,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  list: CategoryList;
  /** Words in the whole list, for the "All" entry; without it the entry has no count. */
  allCount?: number;
  /** For choosing one category (the export): no "All" entry. */
  hideAll?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const named = (name: string, count?: number | string) =>
    count === undefined ? name : t("categories.withCount", { name, count });
  const options = [
    ...(hideAll
      ? []
      : [{ value: "", label: named(t("categories.all"), allCount) }]),
    {
      value: UNCATEGORIZED,
      label: named(
        t("categories.uncategorized"),
        formatCount(list.uncategorizedTotal ?? 0, list.countsCapped ?? false),
      ),
    },
    ...list.categories.map((c) => ({
      value: c.id,
      label: named(
        c.name,
        formatCount(
          c.total ?? 0,
          list.countsCapped ?? false,
          CATEGORY_COUNT_CAP,
        ),
      ),
    })),
  ];
  return (
    <Dropdown
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      className={className}
    />
  );
}

/** Category names as small badges, or the toggles that pick some of them (`onToggle`). */
export function CategoryChips({
  categories,
  ids,
  onToggle,
  label,
  max,
}: {
  categories: Category[];
  ids: string[];
  onToggle?: (id: string) => void;
  label?: string;
  /** Show this many badges and a "…" badge that shows the rest when clicked (not for the toggles). */
  max?: number;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const all = onToggle
    ? categories
    : categories.filter((c) => ids.includes(c.id));
  if (all.length === 0) return null;
  const folded =
    !onToggle && !expanded && max !== undefined && all.length > max;
  const shown = folded ? all.slice(0, max) : all;
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex min-w-0 gap-1.5 ${folded ? "flex-nowrap" : "flex-wrap"}`}
    >
      {shown.map((c) => {
        const on = ids.includes(c.id);
        const cls = `inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-xs font-medium ${on ? "border-transparent bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`;
        return onToggle ? (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            className={`${cls} ${on ? "" : "opacity-70 hover:opacity-100"} cursor-pointer`}
            onClick={() => onToggle(c.id)}
          >
            <span className="truncate">{c.name}</span>
          </button>
        ) : (
          <span key={c.id} className={cls}>
            <span className="truncate">{c.name}</span>
          </span>
        );
      })}
      {folded ? (
        <Tip label={t("categories.showAll", { count: all.length })}>
          <button
            type="button"
            aria-label={t("categories.showAll", { count: all.length })}
            className="inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground hover:opacity-80"
            // the badges can sit in a row that opens when clicked: this only shows the rest
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Ellipsis aria-hidden="true" className="size-3.5" />
          </button>
        </Tip>
      ) : null}
    </div>
  );
}

/** One input that creates a category; `onCreated` gets it (the picker selects it, for example). */
export function NewCategory({
  onCreated,
  onError,
}: {
  onCreated?: (c: Category) => void;
  onError?: (error: unknown) => void;
}) {
  const { t } = useTranslation();
  const api = useDictionary();
  const maxName = useSettings().settings.system.maxCategoryNameLength;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const c = await api.createCategory(n);
      setName("");
      notifySavedChanged();
      onCreated?.(c);
    } catch (err) {
      onError?.(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    // the layout follows the width of the place (a narrow popover or a dialog), not of the screen: the field
    // and the button are stacked until there is room for both side by side
    <div className="@container">
      <form
        className="flex flex-col gap-2 @sm:flex-row"
        onSubmit={(e) => void submit(e)}
      >
        <Input
          className="@sm:flex-1"
          value={name}
          maxLength={maxName}
          aria-label={t("categories.newName")}
          placeholder={t("categories.newName")}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          busy={busy}
          disabled={name.trim() === ""}
          className="@sm:shrink-0"
        >
          <Plus aria-hidden="true" />
          {t("categories.create")}
        </Button>
      </form>
    </div>
  );
}

/** The dialog that creates, renames and deletes categories. */
export function ManageCategories({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
}) {
  const { t } = useTranslation();
  const api = useDictionary();
  const maxName = useSettings().settings.system.maxCategoryNameLength;
  const [editing, setEditing] = useState<{ id: string; name: string }>();
  const [error, setError] = useState<unknown>();
  // an object, so that the same text again shows the notice again (AutoAlert restarts on a new object)
  const [notice, setNotice] = useState<{ text: string }>();
  const { confirm, dialog } = useConfirm({
    title: t("common.confirmTitle"),
    confirm: t("common.confirm"),
    cancel: t("common.cancel"),
    close: t("common.close"),
  });

  async function rename(c: Category) {
    const name = editing?.name.trim() ?? "";
    if (!name) return;
    try {
      const r = await api.renameCategory(c.id, name);
      setError(undefined);
      setEditing(undefined);
      setNotice({ text: t("categories.renamed", { name: r.name }) });
      notifySavedChanged();
    } catch (e) {
      setError(e);
    }
  }

  async function remove(c: Category) {
    if (
      !(await confirm({
        title: t("categories.deleteTitle"),
        message: t("categories.deleteMessage", {
          name: c.name,
          count: c.total ?? 0,
        }),
        confirmLabel: t("common.delete"),
      }))
    )
      return;
    try {
      await api.deleteCategory(c.id);
      setError(undefined);
      setNotice({ text: t("categories.deleted", { name: c.name }) });
      notifySavedChanged();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("categories.manageTitle")}</DialogTitle>
            <DialogDescription>{t("categories.manageHint")}</DialogDescription>
          </DialogHeader>
          {error ? <Alert variant="destructive">{errorMessage(error, t)}</Alert> : null}
          <AutoAlert variant="success" watch={notice}>
            {notice?.text}
          </AutoAlert>
          <NewCategory
            onCreated={(c) => {
              setError(undefined);
              setNotice({ text: t("categories.created", { name: c.name }) });
            }}
            onError={setError}
          />
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("categories.none")}
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {categories.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-1.5"
                >
                  {editing?.id === c.id ? (
                    <>
                      <Label htmlFor={`rename-${c.id}`} className="sr-only">
                        {t("categories.renameInput", { name: c.name })}
                      </Label>
                      <Input
                        id={`rename-${c.id}`}
                        autoFocus
                        value={editing.name}
                        maxLength={maxName}
                        onChange={(e) =>
                          setEditing({ id: c.id, name: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void rename(c);
                          if (e.key === "Escape") setEditing(undefined);
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("categories.renameSave")}
                        title={t("categories.renameSave")}
                        onClick={() => void rename(c)}
                      >
                        <Check aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("common.cancel")}
                        title={t("common.cancel")}
                        onClick={() => setEditing(undefined)}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {c.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {c.total ?? 0}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("categories.rename", { name: c.name })}
                        title={t("categories.rename", { name: c.name })}
                        onClick={() => setEditing({ id: c.id, name: c.name })}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("categories.delete", { name: c.name })}
                        title={t("categories.delete", { name: c.name })}
                        onClick={() => void remove(c)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}
