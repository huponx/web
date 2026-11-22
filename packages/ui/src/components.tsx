import { useEffect, useId } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import "./ui.css";

// ---- layout ----

export interface LayoutProps {
  brand: ReactNode;
  /** Links of the menu (the app decides which ones the user may see). */
  nav?: ReactNode;
  /** Name of the signed in user. */
  user?: ReactNode;
  onLogout?: () => void;
  children: ReactNode;
}

export function Layout({ brand, nav, user, onLogout, children }: LayoutProps) {
  return (
    <div className="ui-layout">
      <header className="ui-header">
        <span className="ui-brand">{brand}</span>
        <nav className="ui-nav" aria-label="Main">
          {nav}
        </nav>
        <div className="ui-user">
          {user ? <span>{user}</span> : null}
          {onLogout ? (
            <Button onClick={onLogout} data-testid="logout">
              Sign out
            </Button>
          ) : null}
        </div>
      </header>
      <main className="ui-main">{children}</main>
    </div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="ui-page-title">{children}</h1>;
}

export function Card({ children }: { children: ReactNode }) {
  return <section className="ui-card">{children}</section>;
}

export function Center({ children }: { children: ReactNode }) {
  return <div className="ui-center">{children}</div>;
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="ui-center" role="status">
      {label}
    </div>
  );
}

// ---- buttons ----

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger" | "link";
  busy?: boolean;
}

export function Button({ variant = "default", busy, disabled, className, type = "button", ...rest }: ButtonProps) {
  const cls = ["ui-btn", variant !== "default" ? `ui-btn-${variant}` : "", className ?? ""].filter(Boolean).join(" ");
  return <button {...rest} type={type} className={cls} disabled={disabled || busy} aria-busy={busy || undefined} />;
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className="ui-actions">{children}</div>;
}

// ---- forms ----

interface FieldShell {
  label: string;
  hint?: string;
  error?: string;
}

function Shell({ id, label, hint, error, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className="ui-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? <span className="ui-field-hint">{hint}</span> : null}
      {error ? (
        <span className="ui-field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function TextField({ label, hint, error, ...rest }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <input {...rest} id={id} className="ui-input" aria-invalid={error ? true : undefined} />
    </Shell>
  );
}

export function TextAreaField({ label, hint, error, ...rest }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <textarea {...rest} id={id} className="ui-textarea" aria-invalid={error ? true : undefined} />
    </Shell>
  );
}

export function SelectField({ label, hint, error, children, ...rest }: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <select {...rest} id={id} className="ui-select" aria-invalid={error ? true : undefined}>
        {children}
      </select>
    </Shell>
  );
}

// ---- table ----

export interface Column<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  caption?: string;
}

export function DataTable<T>({ columns, rows, rowKey, empty = "Nothing to show.", caption }: DataTableProps<T>) {
  return (
    <table className="ui-table">
      {caption ? <caption className="ui-field-hint">{caption}</caption> : null}
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i} scope="col">
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td className="ui-empty" colSpan={columns.length}>
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c, i) => (
                <td key={i}>{c.cell(r)}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export function Badges({ items }: { items: readonly string[] | undefined }) {
  if (!items || items.length === 0) return <span className="ui-field-hint">none</span>;
  return (
    <>
      {items.map((i) => (
        <span key={i} className="ui-badge ui-mono">
          {i}
        </span>
      ))}
    </>
  );
}

// ---- notices ----

export function Notice({ kind = "ok", children }: { kind?: "ok" | "warn" | "error"; children: ReactNode }) {
  return (
    <div className={`ui-notice ui-notice-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

/** The message of any thrown value (an ApiError of the gateway, a network failure, ...). */
export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return typeof e === "string" && e ? e : "Something went wrong.";
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (error === null || error === undefined) return null;
  return <Notice kind="error">{errorMessage(error)}</Notice>;
}

// ---- modal ----

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="ui-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ui-modal" role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
