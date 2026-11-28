import { Can } from "@huponx/auth-client";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Label, SelectField, TextAreaField, TextField, useAction, useLoad, usePaged } from "@huponx/ui-kit";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "../components/ConfirmDialog";
import { DataTable, DoneAlert, ErrorAlert, LoadMore, Loading, PageTitle } from "../components/common";
import { ROUTES } from "../authz";
import { useCourier, when } from "../courier";
import type { Audience, Broadcast } from "../courier";
import { words } from "../api";

type Who = "all" | "role" | "users";

/** The channels of the announcement while the catalog is read: what the event type has today. */
const DEFAULT_CHANNELS = ["email", "in_app", "push"];

/** Send an announcement (the system.announcement event) to everyone, a role or chosen users; the earlier ones are listed. */
export function Announcements() {
  const { t, i18n } = useTranslation();
  const api = useCourier();
  const { confirm, dialog } = useConfirm();
  const a = useAction();
  const history = usePaged((token) => api.broadcasts(token), [api]);
  const audienceText = (a: Audience | undefined) =>
    a?.role ? t("announcements.audience.roleOf", { role: a.role }) : a?.userIds?.length ? t("announcements.audience.usersOf", { count: a.userIds.length }) : t("announcements.audience.everyone");

  const types = useLoad(() => api.eventTypes(), [api]);
  const available = (types.data?.eventTypes.find((e) => e.type === "system.announcement")?.channels as string[] | undefined) ?? DEFAULT_CHANNELS;
  // the channels turned off; nothing off sends on every channel of the type
  const [off, setOff] = useState<string[]>([]);
  const channels = available.filter((c) => !off.includes(c));
  const [who, setWho] = useState<Who>("all");
  const [role, setRole] = useState("");
  const [users, setUsers] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");

  const audience: Audience = who === "all" ? { all: true } : who === "role" ? { role: role.trim() } : { userIds: words(users) };
  const ready = channels.length > 0 && title.trim() !== "" && message.trim() !== "" && (who === "all" || (who === "role" ? role.trim() !== "" : words(users).length > 0));

  async function send() {
    if (!(await confirm({ title: t("announcements.send"), message: t("announcements.confirm", { who: audienceText(audience) }), confirmLabel: t("announcements.send") }))) return;
    const data: Record<string, string> = { title: title.trim(), message: message.trim() };
    if (link.trim()) data.link = link.trim();
    const b = await a.run(() => api.createBroadcast("system.announcement", audience, data, channels), t("announcements.sent"));
    if (b) {
      setTitle("");
      setMessage("");
      setLink("");
      history.reload();
    }
  }

  return (
    <>
      {dialog}
      <PageTitle description={t("announcements.intro")}>{t("announcements.title")}</PageTitle>
      <Can route={ROUTES.createBroadcast}>
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>{t("announcements.new")}</CardTitle>
            <CardDescription>{t("announcements.newHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SelectField
              label={t("announcements.to")}
              value={who}
              onValueChange={(v) => setWho(v as Who)}
              options={[
                { value: "all", label: t("announcements.audience.all") },
                { value: "role", label: t("announcements.audience.role") },
                { value: "users", label: t("announcements.audience.users") },
              ]}
            />
            {who === "role" ? <TextField label={t("announcements.role")} value={role} onChange={(e) => setRole(e.target.value)} clearable={false} /> : null}
            {who === "users" ? <TextAreaField label={t("announcements.userIds")} hint={t("announcements.userIdsHint")} rows={3} value={users} onChange={(e) => setUsers(e.target.value)} /> : null}
            <fieldset className="flex flex-col gap-2" data-testid="announcement-channels">
              <legend className="mb-1 text-sm font-medium">{t("announcements.channels.title")}</legend>
              <div className="flex flex-wrap gap-4">
                {available.map((c) => (
                  <div key={c} className="flex items-center gap-2">
                    <Checkbox id={`ch-${c}`} checked={!off.includes(c)} onCheckedChange={(v) => setOff((o) => (v === true ? o.filter((x) => x !== c) : [...o, c]))} />
                    <Label htmlFor={`ch-${c}`}>{t(`announcements.channels.${c}`, { defaultValue: c })}</Label>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{channels.length === 0 ? t("announcements.channels.none") : t("announcements.channels.hint")}</p>
            </fieldset>
            <TextField label={t("announcements.subject")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} clearable={false} />
            <TextAreaField label={t("announcements.message")} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
            <TextField label={t("announcements.link")} hint={t("announcements.linkHint")} value={link} onChange={(e) => setLink(e.target.value)} clearable={false} />
            <ErrorAlert error={a.error} />
            <DoneAlert watch={a.doneId}>{a.done}</DoneAlert>
            <div className="flex justify-end">
              <Button busy={a.busy} disabled={!ready} onClick={() => void send()}>
                {t("announcements.send")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </Can>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("announcements.history")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ErrorAlert error={history.error} />
          {history.loading ? <Loading /> : null}
          {history.items ? (
            <DataTable<Broadcast>
              rows={history.items}
              rowKey={(b) => b.id}
              columns={[
                { header: t("announcements.col.when"), cell: (b) => when(b.createdAt, i18n.language) },
                { header: t("announcements.col.audience"), cell: (b) => audienceText(b.audience) },
                { header: t("announcements.col.recipients"), cell: (b) => `${b.recipients ?? 0}${b.skipped ? ` (${t("announcements.skipped", { count: b.skipped })})` : ""}` },
                { header: t("announcements.col.channels"), cell: (b) => (b.channels?.length ? b.channels.map((c) => t(`announcements.channels.${c}`, { defaultValue: c })).join(", ") : t("announcements.channels.all")) },
                { header: t("announcements.col.by"), cell: (b) => b.createdBy || "" },
              ]}
            />
          ) : null}
          <LoadMore paged={history} />
        </CardContent>
      </Card>
    </>
  );
}
