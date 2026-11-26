import { useAuth } from "@huponx/auth-client";
import type { Me } from "@huponx/auth-client";
import { AvatarUpload, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, ThemeSwitch, useAction, useLoad } from "@huponx/ui-kit";
import type { AvatarChange } from "@huponx/ui-kit";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../AccountMenu";
import { useIdentity } from "../api";
import { avatarLabels } from "../lib/avatarLabels";
import { DoneAlert, ErrorAlert, Loading, PageTitle, SelectField, TextField } from "../components/common";
import { announceAvatarChanged } from "../lib/avatarEvents";
import { languages } from "../i18n";

/** The own name and picture of the user; the language is in Appearance. Needs no permission. */
function Profile() {
  const { t } = useTranslation();
  const api = useIdentity();
  const me = useLoad(() => api.getMe(), [api]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.profile.title")}</CardTitle>
        <CardDescription>{t("settings.profile.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {me.error ? <ErrorAlert error={me.error} /> : me.data ? <ProfileForm user={me.data} reload={me.reload} /> : <Loading />}
      </CardContent>
    </Card>
  );
}

function ProfileForm({ user, reload }: { user: { name: string; email: string; avatar?: string }; reload: () => void }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const a = useAction();
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState<AvatarChange>(undefined);

  async function save(ev: FormEvent) {
    ev.preventDefault();
    const ok = await a.run(async () => {
      if (name !== user.name) await api.updateMe({ name });
      if (avatar === null) await api.setMyAvatar();
      else if (avatar) await api.setMyAvatar({ image: avatar.base64, mime_type: avatar.mime });
      return true;
    }, t("settings.profile.saved"));
    if (ok) {
      announceAvatarChanged();
      setAvatar(undefined);
      reload();
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(ev) => void save(ev)}>
      <AvatarUpload name={name} email={user.email} current={user.avatar} value={avatar} onChange={setAvatar} labels={avatarLabels(t)} />
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label={t("users.form.email")} value={user.email} disabled readOnly />
        <TextField label={t("users.form.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
      </div>
      <ErrorAlert error={a.error} />
      <DoneAlert watch={a.doneId}>{a.done}</DoneAlert>
      <div className="flex justify-end">
        <Button type="submit" busy={a.busy}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

function Appearance() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.appearance.title")}</CardTitle>
        <CardDescription>{t("settings.appearance.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-2">
          <Label>{t("settings.appearance.theme")}</Label>
          <ThemeSwitch
            labels={{
              group: t("shell.theme.group"),
              light: t("shell.theme.light"),
              dark: t("shell.theme.dark"),
              system: t("shell.theme.system"),
            }}
          />
        </div>
        <div className="w-full sm:max-w-xs">
          <SelectField
            label={t("settings.appearance.language")}
            value={language}
            onValueChange={setLanguage}
            options={languages.map((l) => ({ value: l.code, label: l.label }))}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/** A call through the gateway with the session cookie: the same path every route of the app takes. */
function SessionDetails() {
  const { t } = useTranslation();
  const { client } = useAuth();
  const [data, setData] = useState<Me>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    // an error from the last try stays until this one ends
    client
      .api<Me>("GET", "/auth/me")
      .then((me) => {
        setError(undefined);
        setData(me);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(load, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.session.title")}</CardTitle>
        <CardDescription>{t("settings.session.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorAlert error={error} />
        {loading ? (
          <Loading />
        ) : data ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">{t("settings.session.subject")}</dt>
            <dd className="font-mono">{data.sub}</dd>
            <dt className="text-muted-foreground">{t("settings.session.methods")}</dt>
            <dd>{data.amr.join(", ") || "-"}</dd>
            <dt className="text-muted-foreground">{t("settings.session.expires")}</dt>
            <dd>{new Date(data.expires_at).toLocaleString()}</dd>
          </dl>
        ) : null}
        <div>
          <Button variant="outline" onClick={load}>
            {t("settings.session.refresh")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function Settings() {
  const { t } = useTranslation();
  return (
    <>
      <PageTitle>{t("settings.title")}</PageTitle>
      <Profile />
      <Appearance />
      <SessionDetails />
    </>
  );
}
