import { P, useAuth } from "@huponx/auth-client";
import { Badge, Checkbox, useLoad } from "@huponx/ui-kit";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Permission } from "../api";
import { useIdentity, words } from "../api";
import { TextAreaField } from "./common";

const WILDCARDS = "*";

/** "identity:user:read" belongs to the group "identity:user"; anything with a "*" to the wildcards. */
export function groupOf(name: string): string {
  if (name.includes("*")) return WILDCARDS;
  const parts = name.split(":");
  return parts.length >= 3 ? parts.slice(0, 2).join(":") : (parts[0] ?? name);
}

export function groupPermissions(catalog: Permission[]): [string, Permission[]][] {
  const groups = new Map<string, Permission[]>();
  for (const p of catalog) groups.set(groupOf(p.name), [...(groups.get(groupOf(p.name)) ?? []), p]);
  // wildcards first, then by name
  return [...groups.entries()].sort(([a], [b]) => (a === WILDCARDS ? -1 : b === WILDCARDS ? 1 : a.localeCompare(b)));
}

/** The service of a group: "identity:user" belongs to "identity"; the wildcards stay together. */
export function serviceOf(group: string): string {
  return group === WILDCARDS ? WILDCARDS : (group.split(":")[0] ?? group);
}

/** Groups by service, each with its resource groups; the wildcards come last so the first service opens first. */
export function groupByService(catalog: Permission[]): [string, [string, Permission[]][]][] {
  const out = new Map<string, [string, Permission[]][]>();
  for (const g of groupPermissions(catalog)) out.set(serviceOf(g[0]), [...(out.get(serviceOf(g[0])) ?? []), g]);
  return [...out.entries()].sort(([a], [b]) => (a === WILDCARDS ? 1 : b === WILDCARDS ? -1 : a.localeCompare(b)));
}

function Row({ p, checked, disabled, onChange }: { p: Permission; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  const { t } = useTranslation();
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-md border p-2 transition-colors hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-70"
    >
      <Checkbox id={id} className="mt-0.5" checked={checked} disabled={disabled} aria-labelledby={`${id}-name`} onCheckedChange={(v) => onChange(v === true)} />
      <span className="flex min-w-0 flex-col">
        <span id={`${id}-name`} className="break-all font-mono text-xs">
          {p.name}
          {p.retired ? <Badge variant="outline" className="ml-2 font-sans">{t("roles.perm.retiredBadge")}</Badge> : null}
        </span>
        {p.description ? <span className="text-xs text-muted-foreground">{p.description}</span> : null}
      </span>
    </label>
  );
}

interface Props {
  /** The permission catalog; without it (no right to read it) a text field is shown. */
  catalog?: Permission[];
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  /** The label is for screen readers only (a card title above already says it). */
  hideLabel?: boolean;
}

/** Checkboxes of the catalog grouped by resource; a text field of words when there is no catalog. */
export function PermissionPicker({ catalog, value, onChange, label, hint, disabled, hideLabel }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(value.join("\n"));

  if (!catalog) {
    return (
      <TextAreaField
        label={label}
        hideLabel={hideLabel}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(words(e.target.value));
        }}
        rows={6}
        hint={hint}
        disabled={disabled}
      />
    );
  }
  // Retired permissions (no service declares them any more) and wildcards that cover nothing are not offered, but a
  // role that holds one still shows it, marked retired, so that it can be removed.
  const offered = catalog.filter((p) => !p.retired);
  const known = new Set(offered.map((p) => p.name));
  const retired = new Map(catalog.filter((p) => p.retired).map((p) => [p.name, p]));
  const extra = value.filter((v) => !known.has(v)).map((name): Permission => retired.get(name) ?? { name, retired: true });
  const toggle = (name: string, on: boolean) => onChange(on ? [...value, name] : value.filter((v) => v !== name));
  const services = groupByService(offered).concat(extra.length ? [["?", [["?", extra]]]] : []);
  return (
    <fieldset className="flex flex-col gap-3" aria-label={label}>
      <legend className={hideLabel ? "sr-only" : "text-sm font-medium"}>{label}</legend>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {services.length === 0 ? <p className="text-sm text-muted-foreground">{t("roles.perm.empty")}</p> : null}
      {services.map(([service, groups], i) => (
        <Service
          key={service}
          title={service === WILDCARDS ? t("roles.perm.wildcards") : service === "?" ? t("roles.perm.retired") : service}
          groups={groups}
          value={value}
          disabled={disabled}
          // the first service is open; so is every service that already holds a chosen permission
          initiallyOpen={i === 0 || groups.some(([, items]) => items.some((p) => value.includes(p.name)))}
          onToggle={toggle}
          groupTitle={(g) => (g === WILDCARDS ? t("roles.perm.wildcards") : g === "?" ? t("roles.perm.retiredHint") : g)}
        />
      ))}
    </fieldset>
  );
}

function Service({
  title,
  groups,
  value,
  disabled,
  initiallyOpen,
  onToggle,
  groupTitle,
}: {
  title: string;
  groups: [string, Permission[]][];
  value: string[];
  disabled?: boolean;
  initiallyOpen: boolean;
  onToggle: (name: string, on: boolean) => void;
  groupTitle: (g: string) => string;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const id = useId();
  const all = groups.flatMap(([, items]) => items);
  const chosen = all.filter((p) => value.includes(p.name)).length;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div role="group" aria-label={title} className="rounded-lg border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Chevron className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 capitalize">{title}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {chosen}/{all.length}
        </span>
      </button>
      {open ? (
        <div id={id} className="flex flex-col gap-4 border-t p-3">
          {groups.map(([group, items]) => (
            <div key={group} role="group" aria-label={groupTitle(group)} className="flex flex-col gap-2">
              {groups.length > 1 || group !== title ? (
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{groupTitle(group)}</h4>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((p) => (
                  <Row key={p.name} p={p} checked={value.includes(p.name)} disabled={disabled} onChange={(on) => onToggle(p.name, on)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The permission catalog, when the user may read it (without it the role forms take permissions as text). */
export function usePermissionCatalog() {
  const { can } = useAuth();
  const api = useIdentity();
  const allowed = can(P.identity.permissionRead);
  const catalog = useLoad(() => (allowed ? api.listPermissions() : Promise.resolve(undefined)), [api, allowed]);
  return { allowed, data: catalog.data, error: catalog.error, loading: allowed && catalog.loading, reload: catalog.reload };
}
