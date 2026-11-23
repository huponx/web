import {
  Alert,
  AutoAlert,
  ClearButton,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  cn,
} from "@huponx/ui-kit";
import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { FormEvent, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";

/** Title of a page (the breadcrumb says where it is, this says what it is). */
export function PageTitle({ children, description }: { children: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label ?? t("common.loading")}
    </div>
  );
}

/** The message of any thrown value (an ApiError of the gateway, a network failure, ...). */
export function errorText(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  return typeof e === "string" && e ? e : fallback;
}

export function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (error === null || error === undefined) return null;
  return <Alert variant="destructive">{errorText(error, t("common.somethingWrong"))}</Alert>;
}

/** The result of an action ("Role x created."); goes away by itself like in the dict app. */
export function DoneAlert({ children }: { children?: ReactNode }) {
  return <AutoAlert variant="success">{children}</AutoAlert>;
}

/** Permissions, roles, grants: one badge each, a hint when the list is empty. */
export function BadgeList({ items }: { items: readonly string[] | undefined }) {
  const { t } = useTranslation();
  if (!items || items.length === 0) return <span className="text-xs text-muted-foreground">{t("common.none")}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((i) => (
        <Badge key={i} className="font-mono font-normal">
          {i}
        </Badge>
      ))}
    </span>
  );
}

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  /** The label stays for screen readers only (the surroundings already name the field). */
  hideLabel?: boolean;
}

function Shell({ id, label, hint, error, hideLabel, children }: FieldShellProps & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CLEARABLE_TYPES = ["text", "email", "search", "url", "tel"];

/**
 * Replaces the bubble of the browser ("Please fill out this field.") by the inline error of the field: the
 * browser still blocks the submit and focuses the first invalid field, only the message is ours (translated, in
 * the style of the app).
 */
function useInlineValidation() {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string>();
  return {
    message,
    props: {
      onInvalid: (e: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        e.preventDefault();
        const v = e.currentTarget.validity;
        setMessage(
          v.valueMissing
            ? t("common.required")
            : v.typeMismatch && e.currentTarget.getAttribute("type") === "email"
              ? t("common.invalidEmail")
              : v.patternMismatch
                ? t("common.invalidFormat")
                : e.currentTarget.validationMessage,
        );
      },
      onInput: () => setMessage(undefined),
    },
  };
}

/**
 * A text field with an X inside that empties it while it has a value (not for passwords, disabled or
 * read only fields; `clearable={false}` turns it off). Without `onClear` the field is emptied as if the
 * user deleted the text, so any controlled field works.
 */
export function TextField({
  label,
  hint,
  error,
  onClear,
  clearable: allowClear = true,
  ...rest
}: FieldShellProps & InputHTMLAttributes<HTMLInputElement> & { onClear?: () => void; clearable?: boolean }) {
  const id = useId();
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const inline = useInlineValidation();
  const shown = error ?? inline.message;
  const clearable = allowClear && CLEARABLE_TYPES.includes(rest.type ?? "text") && !!rest.value && !rest.disabled && !rest.readOnly;
  function clear() {
    if (onClear) return onClear();
    const input = box.current?.querySelector("input");
    if (!input) return;
    // React tracks the value itself: set it through the native setter, then fire the event it listens to
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }
  return (
    <Shell id={id} label={label} hint={hint} error={shown}>
      <div className="relative" ref={box}>
        <Input
          {...rest}
          {...inline.props}
          onInput={(e) => {
            inline.props.onInput();
            rest.onInput?.(e);
          }}
          id={id}
          aria-invalid={shown ? true : undefined} className={clearable ? `pr-9 ${rest.className ?? ""}` : rest.className}
        />
        {clearable ? (
          <ClearButton label={t("common.clearField", { label })} onClick={clear} />
        ) : null}
      </div>
    </Shell>
  );
}

export function TextAreaField({ label, hint, error, hideLabel, ...rest }: FieldShellProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const inline = useInlineValidation();
  const shown = error ?? inline.message;
  return (
    <Shell id={id} label={label} hint={hint} error={shown} hideLabel={hideLabel}>
      <Textarea {...rest} {...inline.props} id={id} aria-invalid={shown ? true : undefined} />
    </Shell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  value,
  onValueChange,
  options,
  disabled,
}: FieldShellProps & { value: string; onValueChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Shell>
  );
}

export interface Column<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Table className={className}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((c, i) => (
            <TableHead key={i} scope="col" className={c.className}>
              {c.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
              {empty ?? t("common.empty")}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((r) => (
            <TableRow key={rowKey(r)}>
              {columns.map((c, i) => (
                <TableCell key={i} className={cn(c.className)}>
                  {c.cell(r)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

/** A dialog that is open while it is rendered: the page mounts it for the item being edited. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t("common.close")} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** A group of buttons, at the right edge of the page or card. */
export function Actions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center justify-end gap-2", className)}>{children}</div>;
}

/** The button that appends the next page of a list (see usePaged); nothing when the list is complete. */
export function LoadMore({ paged }: { paged: { next: string; loadMore: () => Promise<void>; moreBusy: boolean; moreError: unknown } }) {
  const { t } = useTranslation();
  return (
    <>
      <ErrorAlert error={paged.moreError} />
      {paged.next ? (
        <Actions>
          <Button variant="outline" busy={paged.moreBusy} onClick={() => void paged.loadMore()}>
            {t("common.loadMore")}
          </Button>
        </Actions>
      ) : null}
    </>
  );
}

/** Class of a row action: a square icon button on a phone, icon and text from `md` up. */
export const ROW_ACTION = "max-md:size-8 max-md:px-0";

/** Content of a row action: the icon always, the text from `md` up (it stays for screen readers). */
export function ActionLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <>
      <Icon aria-hidden="true" />
      <span className="max-md:sr-only">{children}</span>
    </>
  );
}
