import { Can, useAuth } from "@huponx/auth-client";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, useAction, useFlash, useLoad } from "@huponx/ui-kit";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { statusOf, useIdentity } from "../api";
import type { User } from "../api";
import { AvatarUpload } from "../components/AvatarUpload";
import type { AvatarChange } from "../components/AvatarUpload";
import { Actions, DoneAlert, ErrorAlert, Loading, PageTitle, SelectField, TextField } from "../components/common";
import { formatDateTime } from "../lib/date";
import { announceAvatarChanged } from "../lib/avatarEvents";
import { RoleCards } from "../components/RoleCards";
import { UserMfa } from "./UserMfa";

const LOCALES = [
  { value: "en", label: "English" },
  { value: "vi", label: "Tiếng Việt" },
];
function StatusBadge({ user }: { user: User }) {
  const { t } = useTranslation();
  const s = statusOf(user);
  return (
    <Badge variant={s === "active" ? "success" : s === "disabled" ? "destructive" : "warning"} data-testid="user-status">
      {t(`users.status.${s}`)}
    </Badge>
  );
}

function AccountCard({ user, onChanged }: { user: User; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const api = useIdentity();
  const a = useAction();
  const status = statusOf(user);

  async function act(fn: () => Promise<unknown>, message: string, changed = false) {
    const r = await a.run(async () => (await fn(), true), message);
    if (r && changed) onChanged();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("users.account.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm">
          {t("users.account.status")} <StatusBadge user={user} />
        </p>
        <p className="text-sm">
          {t("users.account.lastLogin")}{" "}
          <span className="text-muted-foreground">{formatDateTime(user.lastLoginAt, i18n.resolvedLanguage ?? "en") ?? t("users.never")}</span>
        </p>
        {status === "pending" ? <p className="text-sm text-muted-foreground">{t("users.account.pendingHint")}</p> : null}
        <Can perm="identity:user:write">
          <Actions className="justify-start">
            {status === "pending" ? (
              <Button variant="outline" busy={a.busy} onClick={() => void act(() => api.sendWelcome(user.id), t("users.account.welcomeSent"))}>
                {t("users.account.resendWelcome")}
              </Button>
            ) : (
              <Button variant="outline" busy={a.busy} onClick={() => void act(() => api.sendReset(user.id), t("users.account.resetSent"))}>
                {t("users.account.sendReset")}
              </Button>
            )}
            <Button
              variant="outline"
              busy={a.busy}
              onClick={() =>
                void act(
                  () => api.setDisabled(user.id, !user.disabled),
                  user.disabled ? t("users.account.enabled") : t("users.account.disabled"),
                  true,
                )
              }
            >
              {user.disabled ? t("users.account.enable") : t("users.account.disable")}
            </Button>
          </Actions>
        </Can>
        <ErrorAlert error={a.error} />
        <DoneAlert watch={a.doneId}>{a.done}</DoneAlert>
      </CardContent>
    </Card>
  );
}

/** The form of "Add user" (no user) and "Edit user". */
function Editor({ user, reload, createdNote }: { user?: User; reload: () => void; createdNote?: string }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const api = useIdentity();
  const navigate = useNavigate();
  const a = useAction();
  const editing = !!user;
  const canWrite = can("identity:user:write");

  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [locale, setLocale] = useState(user?.locale || "en");
  const [roles, setRoles] = useState<string[]>(user?.roles ?? []);
  const [avatar, setAvatar] = useState<AvatarChange>(undefined);

  async function create() {
    const created = await a.run(() => api.createUser({ email, name, locale, roles, send_welcome: true }));
    if (!created) return;
    let avatarFailed = false;
    if (avatar) {
      try {
        await api.setAvatar(created.id, { image: avatar.base64, mime_type: avatar.mime });
      } catch {
        avatarFailed = true; // the user exists now: go on to the edit page, where the picture can be set again
      }
    }
    navigate(`/users/${encodeURIComponent(created.id)}`, { state: { created: created.email, avatarFailed } });
  }

  async function save() {
    if (!user) return;
    const ok = await a.run(async () => {
      if (name !== user.name || locale !== (user.locale || "en")) await api.updateUser(user.id, { name, locale });
      if (avatar === null) await api.setAvatar(user.id);
      else if (avatar) await api.setAvatar(user.id, { image: avatar.base64, mime_type: avatar.mime });
      for (const r of roles.filter((x) => !user.roles.includes(x))) await api.assignRole(r, { user_id: user.id });
      for (const r of user.roles.filter((x) => !roles.includes(x))) await api.revokeRole(r, { user_id: user.id });
      return true;
    }, t("users.edit.saved"));
    if (ok) {
      if (avatar !== undefined) announceAvatarChanged();
      setAvatar(undefined);
      reload();
    }
  }

  return (
    <>
      <PageTitle description={editing ? undefined : t("users.new.description")}>{editing ? user.email : t("users.new.title")}</PageTitle>
      {createdNote ? <DoneAlert>{createdNote}</DoneAlert> : null}
      <form
        className="flex flex-col gap-6"
        onSubmit={(ev) => {
          ev.preventDefault();
          void (editing ? save() : create());
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>{t("users.form.profile")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <AvatarUpload name={name} email={email} current={user?.avatar} value={avatar} onChange={setAvatar} disabled={!canWrite} />
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label={t("users.form.email")}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={editing || !canWrite}
              />
              <TextField label={t("users.form.name")} value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
              <SelectField label={t("users.form.locale")} hint={t("users.form.localeHint")} value={locale} onValueChange={setLocale} options={LOCALES} />
            </div>
          </CardContent>
        </Card>
        <Can perm="identity:role:read">
          <Card>
            <CardHeader>
              <CardTitle>{t("users.roles.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RoleCards selected={roles} onChange={setRoles} disabled={!canWrite || (editing && !can("identity:role:write"))} />
            </CardContent>
          </Card>
        </Can>
        <ErrorAlert error={a.error} />
        {editing ? <DoneAlert watch={a.doneId}>{a.done}</DoneAlert> : null}
        <Actions>
          {canWrite ? (
            <Button type="submit" busy={a.busy}>
              {editing ? t("users.edit.save") : t("users.new.create")}
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to="/users">{t("common.cancel")}</Link>
          </Button>
        </Actions>
        {!editing ? <p className="text-xs text-muted-foreground">{t("users.new.welcomeNote")}</p> : null}
      </form>
    </>
  );
}

export function UserForm() {
  const { id } = useParams();
  const { t } = useTranslation();
  const api = useIdentity();
  const state = useFlash<{ created?: string; avatarFailed?: boolean }>();
  const { data, error, loading, reload } = useLoad(() => (id ? api.getUser(id) : Promise.resolve(undefined)), [api, id]);

  if (!id) return <Editor reload={() => undefined} />;
  if (error) return <ErrorAlert error={error} />;
  if (loading || !data) return <Loading />;

  const note = state?.created
    ? `${t("users.new.created", { email: state.created })} ${t("users.new.welcomeSent")}${state.avatarFailed ? ` ${t("users.avatar.failedAfterCreate")}` : ""}`
    : undefined;
  return (
    <div className="flex flex-col gap-6">
      <Editor key={data.id} user={data} reload={reload} createdNote={note} />
      <AccountCard user={data} onChanged={reload} />
      <Can perm="identity:mfa:read">
        <Card>
          <CardContent className="pt-6">
            <UserMfa user={data} onChanged={reload} />
          </CardContent>
        </Card>
      </Can>
    </div>
  );
}
