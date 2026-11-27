import { Alert, Button, Checkbox, iconTone, PickerSurface, usePickerMode } from "@huponx/ui-kit";
import type { ButtonProps } from "@huponx/ui-kit";
import { Tags } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../lib/errors";
import type { Category } from "../api";
import { NewCategory } from "./Categories";

export interface CategoryPickerProps {
  categories: Category[];
  /** Whether a category is on for what the picker edits: all of it, none of it, or part of it (several words). */
  state: (id: string) => boolean | "indeterminate";
  onToggle: (id: string) => void;
  /** A category was just created in the picker. */
  onCreated?: (c: Category) => void;
  onError?: (error: unknown) => void;
  /** How many categories are on, shown next to the label; none: no number. */
  count?: number;
  /** Name of the button and of the list. */
  label: string;
  /** Line above the list. */
  heading?: string;
  /** Makes what is on now the default of the cards to come (the button is shown only with it). */
  onSetDefault?: () => void;
  defaultLabel?: string;
  /** Drops the default (the button is shown only with it). */
  onClearDefault?: () => void;
  clearDefaultLabel?: string;
  disabled?: boolean;
  variant?: ButtonProps["variant"];
  className?: string;
}

/** A button that opens the categories as checkboxes: a popover next to it, a bottom sheet on a phone. */
export function CategoryPicker({
  categories,
  state,
  onToggle,
  onCreated,
  onError,
  count,
  label,
  heading,
  onSetDefault,
  defaultLabel,
  onClearDefault,
  clearDefaultLabel,
  disabled,
  variant = "outline",
  className,
}: CategoryPickerProps) {
  const { t } = useTranslation();
  const mode = usePickerMode();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>();
  return (
    <PickerSurface
      mode={mode}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(undefined);
      }}
      title={label}
      align="end"
      trigger={
        <Button
          type="button"
          variant={variant}
          size="sm"
          disabled={disabled}
          aria-label={count ? `${label} (${count})` : label}
          title={label}
          className={className}
        >
          <Tags aria-hidden="true" className={iconTone.tags} />
          <span className="max-sm:sr-only">{label}</span>
          {count ? <span aria-hidden="true">({count})</span> : null}
        </Button>
      }
    >
      {heading ? (
        <p className="text-xs text-muted-foreground">{heading}</p>
      ) : null}
      {error ? <Alert variant="destructive">{errorMessage(error, t)}</Alert> : null}
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("categories.none")}</p>
      ) : (
        <div
          role="group"
          aria-label={label}
          className="max-h-60 overflow-y-auto"
        >
          {categories.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent"
            >
              <Checkbox
                aria-label={c.name}
                checked={state(c.id)}
                onCheckedChange={() => onToggle(c.id)}
              />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
            </label>
          ))}
        </div>
      )}
      {onSetDefault || onClearDefault ? (
        <div className="flex flex-wrap gap-x-2">
          {onSetDefault ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSetDefault}
            >
              {defaultLabel}
            </Button>
          ) : null}
          {onClearDefault ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearDefault}
            >
              {clearDefaultLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="border-t pt-2">
        <NewCategory
          onCreated={(c) => {
            setError(undefined);
            onCreated?.(c);
          }}
          onError={(m) => {
            setError(m);
            onError?.(m);
          }}
        />
      </div>
    </PickerSurface>
  );
}
