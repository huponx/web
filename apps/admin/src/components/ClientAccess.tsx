import { Button, Checkbox } from "@huponx/ui-kit";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { words } from "../api";
import { TextField } from "./common";

/** The grants identity accepts (knownGrants in identity), with the key of their description. */
export const GRANTS = [
  { value: "authorization_code", key: "authorization_code" },
  { value: "refresh_token", key: "refresh_token" },
  { value: "client_credentials", key: "client_credentials" },
  { value: "urn:ietf:params:oauth:grant-type:token-exchange", key: "token_exchange" },
] as const;

/** A public client has no secret, so it can only use these. */
export const PUBLIC_GRANTS: readonly string[] = ["authorization_code", "refresh_token"];

export const SCOPES = ["openid", "profile", "email", "offline_access"] as const;

function GrantCard({ value, descKey, checked, disabled, onChange }: { value: string; descKey: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <label
      htmlFor={id}
      data-testid={`grant-card-${value}`}
      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
    >
      <Checkbox id={id} className="mt-0.5" checked={checked} disabled={disabled} aria-labelledby={`${id}-name`} onCheckedChange={(v) => onChange(v === true)} />
      <span className="flex min-w-0 flex-col gap-1">
        <span id={`${id}-name`} className="font-mono text-sm font-medium break-all">
          {value}
        </span>
        <span className="text-xs text-muted-foreground">{t(`clients.grant.${descKey}`)}</span>
      </span>
    </label>
  );
}

/** Grants as cards: only what identity accepts can be picked; a public client cannot pick the ones that need a secret. */
export function GrantCards({ selected, onChange, publicClient, disabled }: { selected: string[]; onChange: (v: string[]) => void; publicClient: boolean; disabled: boolean }) {
  const { t } = useTranslation();
  const known = new Set<string>(GRANTS.map((g) => g.value));
  // a value stored before that is not known any more stays visible, so it can be removed
  const extra = selected.filter((g) => !known.has(g));
  return (
    <div role="group" aria-label={t("clients.new.grants")} className="grid gap-3 sm:grid-cols-2">
      {GRANTS.map((g) => (
        <GrantCard
          key={g.value}
          value={g.value}
          descKey={g.key}
          checked={selected.includes(g.value)}
          disabled={disabled || (publicClient && !PUBLIC_GRANTS.includes(g.value))}
          onChange={(v) => onChange(v ? [...selected, g.value] : selected.filter((x) => x !== g.value))}
        />
      ))}
      {extra.map((g) => (
        <GrantCard key={g} value={g} descKey="unknown" checked disabled={disabled} onChange={() => onChange(selected.filter((x) => x !== g))} />
      ))}
    </div>
  );
}

/** Scopes are free text; the standard ones are buttons that add or remove them. Empty means the default set. */
export function ScopeField({ value, onChange, disabled, label, hint }: { value: string; onChange: (v: string) => void; disabled: boolean; label?: string; hint?: string }) {
  const { t } = useTranslation();
  const current = words(value);
  function toggle(s: string) {
    onChange((current.includes(s) ? current.filter((x) => x !== s) : [...current, s]).join(" "));
  }
  return (
    <div className="flex flex-col gap-2">
      <TextField label={label ?? t("clients.new.scopes")} value={value} onChange={(e) => onChange(e.target.value)} hint={hint ?? t("clients.new.scopesHint")} disabled={disabled} />
      <div role="group" aria-label={t("clients.scope.suggested")} className="flex flex-wrap gap-2">
        {SCOPES.map((s) => (
          <Button key={s} type="button" size="sm" variant={current.includes(s) ? "default" : "outline"} aria-pressed={current.includes(s)} disabled={disabled} className="font-mono" onClick={() => toggle(s)}>
            {s}
          </Button>
        ))}
      </div>
    </div>
  );
}
