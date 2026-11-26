import { AvatarUpload, rememberLanguageChoice, useTheme } from "@huponx/ui-kit";
import type { AvatarChange } from "@huponx/ui-kit";
import { BadgeList, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, DoneAlert, ErrorAlert, Label, Loading, PageTitle, SelectField, TextField, useAction, useLoad } from "@huponx/ui-kit";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../api";
import type { Account } from "../api";
import { avatarLabels } from "../lib/avatarLabels";
import { LANGUAGE_STORAGE_KEY, languages } from "../i18n";
import { announceAvatarChanged } from "../lib/avatarEvents";

const THEMES = ["light", "dark", "system"] as const;

function ProfileForm({ user, reload }: { user: Account; reload: () => void }) {
  const { t, i18n } = useTranslation();
  const api = useIdentity();
  const { theme: currentTheme, setTheme } = useTheme();
  const a = useAction();
  const [name, setName] = useState(user.name);
  const [locale, setLocale] = useState<string>(() => (languages.some((l) => l.code === user.locale) ? user.locale : (i18n.resolvedLanguage ?? "en")));
  const [theme, setThemeValue] = useState<string>(user.theme || currentTheme);
  const [avatar, setAvatar] = useState<AvatarChange>(undefined);

  async function save(ev: FormEvent) {
    ev.preventDefault();
    const ok = await a.run(async () => {
      await api.updateMe({ name: name.trim(), locale, theme });
      if (avatar === null) await api.setMyAvatar();
      else if (avatar) await api.setMyAvatar({ image: avatar.base64, mime_type: avatar.mime });
      return true;
    }, t("profile.saved"));
    if (ok) {
      // the saved language and theme apply at once
      if (locale !== i18n.resolvedLanguage) await i18n.changeLanguage(locale);
      rememberLanguageChoice(LANGUAGE_STORAGE_KEY, locale);
      if (theme === "light" || theme === "dark" || theme === "system") setTheme(theme);
      announceAvatarChanged();
      setAvatar(undefined);
      reload();
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(ev) => void save(ev)}>
      <AvatarUpload name={name} email={user.email} current={user.avatar} value={avatar} onChange={setAvatar} labels={avatarLabels(t)} />
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label={t("profile.email")} value={user.email} disabled readOnly />
        <div className="flex flex-col gap-2">
          <Label>{t("profile.roles")}</Label>
          <BadgeList items={user.roles} />
        </div>
        <TextField label={t("profile.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        <SelectField label={t("profile.language")} value={locale} onValueChange={setLocale} options={languages.map((l) => ({ value: l.code, label: l.label }))} />
        <SelectField label={t("profile.theme")} value={theme} onValueChange={setThemeValue} options={THEMES.map((v) => ({ value: v, label: t(`shell.theme.${v}`) }))} />
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

/** The own name, language, theme and picture of the user. Needs no permission. */
export function Profile() {
  const { t } = useTranslation();
  const api = useIdentity();
  const me = useLoad(() => api.getMe(), [api]);
  return (
    <>
      <PageTitle>{t("profile.title")}</PageTitle>
      <Card>
        <CardHeader>
          <CardTitle>{t("profile.title")}</CardTitle>
          <CardDescription>{t("profile.description")}</CardDescription>
        </CardHeader>
        <CardContent>{me.error ? <ErrorAlert error={me.error} /> : me.data ? <ProfileForm user={me.data} reload={me.reload} /> : <Loading />}</CardContent>
      </Card>
    </>
  );
}
