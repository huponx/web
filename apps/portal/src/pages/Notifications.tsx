import { useAuth } from "@huponx/auth-client";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, DoneAlert, ErrorAlert, Loading, PageTitle, SelectField, SwitchRow, TextField, currentEndpoint, pushSupported, subscribeThisDevice, unsubscribeThisDevice, useAction, useLoad } from "@huponx/ui-kit";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

/** What the gateway answers (protojson): `disabledChannels` and the booleans are empty or false when unset. */
interface Category {
  category: string;
  mandatory?: boolean;
  channels?: string[];
  disabledChannels?: string[];
}

interface Preferences {
  categories?: Category[];
  quietHours?: { enabled?: boolean; from?: string; to?: string; timezone?: string };
  telegram?: { available?: boolean; linked?: boolean };
  push?: { available?: boolean; publicKey?: string; endpoints?: string[] };
}

interface Binding {
  code: string;
  link: string;
  expiresAt: string | number;
}

const PREFS = "/api/notifications/preferences";
const BINDING = "/api/notifications/telegram-binding";
const CHANNELS = ["email", "telegram", "in_app", "push"] as const;
const PUSH = "/api/notifications/push-subscription";

function timeZones(current: string): string[] {
  const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  return list.includes(current) ? list : [current, ...list];
}

function TelegramCard({ linked, reload }: { linked: boolean; reload: () => void }) {
  const { t } = useTranslation();
  const { client } = useAuth();
  const a = useAction();
  const [binding, setBinding] = useState<Binding>();

  // while a code waits for the bot, look for the link every few seconds, and stop when it is made or the code expires
  useEffect(() => {
    if (!binding || linked) return;
    const stop = Number(binding.expiresAt) * 1000;
    const timer = setInterval(() => {
      if (Date.now() > stop) setBinding(undefined);
      else reload();
    }, 3000);
    return () => clearInterval(timer);
  }, [binding, linked, reload]);

  async function start() {
    const b = await a.run(() => client.api<Binding>("POST", BINDING));
    if (b) setBinding(b);
  }

  async function unlink() {
    await a.run(async () => {
      await client.api("DELETE", BINDING);
      setBinding(undefined);
      reload();
    }, t("notificationSettings.telegram.unlinked"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("notificationSettings.telegram.title")}</CardTitle>
        <CardDescription>{t("notificationSettings.telegram.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2" data-testid="telegram-state">
          <Badge variant={linked ? "default" : "secondary"}>{linked ? t("notificationSettings.telegram.linked") : t("notificationSettings.telegram.notLinked")}</Badge>
        </div>
        {!linked && binding ? (
          <div className="flex flex-col gap-2 text-sm" data-testid="telegram-binding">
            <p>{t("notificationSettings.telegram.openLink")}</p>
            <a className="text-primary underline" href={binding.link} target="_blank" rel="noopener noreferrer">
              {t("notificationSettings.telegram.open")}
            </a>
            <p className="text-muted-foreground">
              {t("notificationSettings.telegram.orSend")} <code className="rounded bg-muted px-1">/start {binding.code}</code>
            </p>
          </div>
        ) : null}
        <ErrorAlert error={a.error} />
        <DoneAlert watch={a.doneId}>{a.done}</DoneAlert>
        <div>
          {linked ? (
            <Button variant="outline" busy={a.busy} onClick={() => void unlink()}>
              {t("notificationSettings.telegram.unlink")}
            </Button>
          ) : (
            <Button busy={a.busy} onClick={() => void start()}>
              {binding ? t("notificationSettings.telegram.newCode") : t("notificationSettings.telegram.link")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Browser notifications on this device: asks for the permission, subscribes, and tells courier. */
function PushCard({ publicKey, endpoints, reload }: { publicKey: string; endpoints: string[]; reload: () => void }) {
  const { t } = useTranslation();
  const { client } = useAuth();
  const a = useAction();
  const [mine, setMine] = useState<string>();
  const [permission, setPermission] = useState<string>(typeof Notification === "undefined" ? "default" : Notification.permission);

  // this browser has a subscription that courier knows
  useEffect(() => {
    void currentEndpoint().then(setMine);
  }, [endpoints]);
  const on = mine !== undefined && endpoints.includes(mine);

  async function enable() {
    const r = await a.run(async () => {
      const sub = await subscribeThisDevice(publicKey);
      await client.api("POST", PUSH, sub);
      return sub.endpoint;
    }, t("notificationSettings.push.enabled"));
    setPermission(Notification.permission);
    if (r) {
      setMine(r);
      reload();
    }
  }

  async function disable() {
    await a.run(async () => {
      const endpoint = await unsubscribeThisDevice();
      if (endpoint) await client.api("DELETE", `${PUSH}?${new URLSearchParams({ endpoint })}`);
      setMine(undefined);
      reload();
    }, t("notificationSettings.push.disabled"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("notificationSettings.push.title")}</CardTitle>
        <CardDescription>{t("notificationSettings.push.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2" data-testid="push-state">
          <Badge variant={on ? "default" : "secondary"}>{on ? t("notificationSettings.push.on") : t("notificationSettings.push.off")}</Badge>
          <span className="text-sm text-muted-foreground">{t("notificationSettings.push.devices", { count: endpoints.length })}</span>
        </div>
        {permission === "denied" ? <p className="text-sm text-destructive">{t("notificationSettings.push.denied")}</p> : null}
        <ErrorAlert error={a.error instanceof Error && a.error.message === "permission-denied" ? new Error(t("notificationSettings.push.denied")) : a.error} />
        <DoneAlert watch={a.doneId}>{a.done}</DoneAlert>
        <div>
          {on ? (
            <Button variant="outline" busy={a.busy} onClick={() => void disable()}>
              {t("notificationSettings.push.disable")}
            </Button>
          ) : (
            <Button busy={a.busy} onClick={() => void enable()}>
              {t("notificationSettings.push.enable")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Form({ prefs, reload }: { prefs: Preferences; reload: () => void }) {
  const { t } = useTranslation();
  const { client } = useAuth();
  const a = useAction();
  const categories = prefs.categories ?? [];
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  // the channels turned off, per category
  const [off, setOff] = useState<Record<string, string[]>>(() => Object.fromEntries(categories.map((c) => [c.category, c.disabledChannels ?? []])));
  const q = prefs.quietHours;
  const [quiet, setQuiet] = useState(q?.enabled === true);
  const [from, setFrom] = useState(q?.from || "22:00");
  const [to, setTo] = useState(q?.to || "07:00");
  const [zone, setZone] = useState(q?.timezone || browserZone);
  const zones = useMemo(() => timeZones(zone), [zone]);

  function toggle(category: string, channel: string, on: boolean) {
    setOff((prev) => {
      const rest = (prev[category] ?? []).filter((c) => c !== channel);
      return { ...prev, [category]: on ? rest : [...rest, channel] };
    });
  }

  async function save() {
    await a.run(async () => {
      await client.api("PUT", PREFS, {
        categories: categories.filter((c) => !c.mandatory).map((c) => ({ category: c.category, disabledChannels: off[c.category] ?? [] })),
        quietHours: quiet ? { enabled: true, from, to, timezone: zone } : { enabled: false },
      });
      reload();
    }, t("notificationSettings.saved"));
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("notificationSettings.channels.title")}</CardTitle>
          <CardDescription>{t("notificationSettings.channels.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {categories.map((c) => (
            <fieldset key={c.category} className="flex flex-col gap-3" data-testid={`category-${c.category}`}>
              <legend className="flex items-center gap-2 text-sm font-semibold">
                {t(`notificationSettings.categories.${c.category}`, { defaultValue: c.category })}
                {c.mandatory ? <Badge variant="secondary">{t("notificationSettings.alwaysOn")}</Badge> : null}
              </legend>
              {CHANNELS.filter((ch) => c.channels?.includes(ch)).map((ch) => (
                <SwitchRow
                  key={ch}
                  label={t(`notificationSettings.channel.${ch}`)}
                  checked={c.mandatory ? true : !(off[c.category] ?? []).includes(ch)}
                  disabled={c.mandatory}
                  onChange={(on) => toggle(c.category, ch, on)}
                />
              ))}
            </fieldset>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("notificationSettings.quiet.title")}</CardTitle>
          <CardDescription>{t("notificationSettings.quiet.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SwitchRow label={t("notificationSettings.quiet.enable")} checked={quiet} onChange={setQuiet} />
          {quiet ? (
            <div className="grid gap-4 md:grid-cols-3">
              <TextField label={t("notificationSettings.quiet.from")} type="time" value={from} onChange={(e) => setFrom(e.target.value)} clearable={false} />
              <TextField label={t("notificationSettings.quiet.to")} type="time" value={to} onChange={(e) => setTo(e.target.value)} clearable={false} />
              <SelectField label={t("notificationSettings.quiet.timezone")} value={zone} onValueChange={setZone} options={zones.map((z) => ({ value: z, label: z }))} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ErrorAlert error={a.error} />
      <DoneAlert watch={a.doneId}>{a.done}</DoneAlert>
      <div className="flex justify-end">
        <Button busy={a.busy} onClick={() => void save()}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

/** Settings, Notifications: which categories reach the user on which channel, quiet hours, and the Telegram chat. */
export function Notifications() {
  const { t } = useTranslation();
  const { client } = useAuth();
  const prefs = useLoad(() => client.api<Preferences>("GET", PREFS), [client]);
  const d = prefs.data;
  return (
    <>
      <PageTitle description={t("notificationSettings.description")}>{t("notificationSettings.title")}</PageTitle>
      {prefs.error ? (
        <ErrorAlert error={prefs.error} />
      ) : d ? (
        <div className="mt-4 flex flex-col gap-4">
          {/* the form keeps its own state: it is remounted when the saved values arrive */}
          <Form key={JSON.stringify([d.categories, d.quietHours])} prefs={d} reload={prefs.reload} />
          {d.telegram?.available ? <TelegramCard linked={d.telegram.linked === true} reload={prefs.reload} /> : null}
          {d.push?.available && d.push.publicKey && pushSupported() ? <PushCard publicKey={d.push.publicKey} endpoints={d.push.endpoints ?? []} reload={prefs.reload} /> : null}
        </div>
      ) : (
        <Loading />
      )}
    </>
  );
}
