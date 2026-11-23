import { Badge, Checkbox, useLoad } from "@huponx/ui-kit";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../api";
import type { Role } from "../api";
import { ErrorAlert, Loading } from "./common";

/** Permissions shown on a role card before "+N more". */
const SHOWN_PERMS = 6;

function RoleCard({ role, checked, disabled, onChange }: { role: Role; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const id = useId();
  const perms = role.permissions ?? [];
  return (
    <label
      htmlFor={id}
      data-testid={`role-card-${role.name}`}
      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-70"
    >
      <Checkbox id={id} className="mt-0.5" checked={checked} disabled={disabled} aria-labelledby={`${id}-name`} onCheckedChange={(v) => onChange(v === true)} />
      <span className="flex min-w-0 flex-col gap-1">
        <span id={`${id}-name`} className="font-medium">
          {role.name}
        </span>
        {role.description ? <span className="text-xs text-muted-foreground">{role.description}</span> : null}
        <span className="flex flex-wrap gap-1">
          {perms.slice(0, SHOWN_PERMS).map((p) => (
            <Badge key={p} className="font-mono text-[11px] font-normal">
              {p}
            </Badge>
          ))}
          {perms.length > SHOWN_PERMS ? <Badge className="font-normal">{t("users.roles.more", { count: perms.length - SHOWN_PERMS })}</Badge> : null}
        </span>
      </span>
    </label>
  );
}

export function RoleCards({ selected, onChange, disabled }: { selected: string[]; onChange: (v: string[]) => void; disabled: boolean }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const roles = useLoad(() => api.listRoles(), [api]);
  // roles of the user that no longer exist are still shown, so they can be removed
  const names = new Set(roles.data?.map((r) => r.name));
  const orphans = selected.filter((r) => roles.data && !names.has(r)).map((name): Role => ({ name, description: "", permissions: [] }));
  const all = [...(roles.data ?? []), ...orphans];
  return (
    <section aria-label={t("users.roles.title")} className="flex flex-col gap-3">
      <ErrorAlert error={roles.error} />
      {roles.loading ? <Loading /> : null}
      {roles.data && all.length === 0 ? <p className="text-sm text-muted-foreground">{t("users.roles.none")}</p> : null}
      <div role="group" aria-label={t("users.roles.title")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {all.map((r) => (
          <RoleCard
            key={r.name}
            role={r}
            checked={selected.includes(r.name)}
            disabled={disabled}
            onChange={(v) => onChange(v ? [...selected, r.name] : selected.filter((x) => x !== r.name))}
          />
        ))}
      </div>
    </section>
  );
}
