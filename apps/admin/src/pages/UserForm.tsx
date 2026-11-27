import { Can, P, useAuth } from "@huponx/auth-client";
import { AvatarUpload, Badge, Button, Card, CardContent, CardHeader, CardTitle, SplitButton, useAction, useFlash, useLoad } from "@huponx/ui-kit";
import type { AvatarChange } from "@huponx/ui-kit";
import { Check, X } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { statusOf, useIdentity } from "../api";
import type { User } from "../api";
import { avatarLabels } from "../lib/avatarLabels";
import { Actions, DoneAlert, ErrorAlert, Loading, PageTitle, SelectField, TextField } from "../components/common";
import { formatDateTime } from "../lib/date";
import { announceAvatarChanged } from "../lib/avatarEvents";
import { useConfirm } from "../components/ConfirmDialog";
import { RoleCards } from "../components/RoleCards";
import { UserMfa } from "./UserMfa";
import { UserStorage } from "./UserStorage";

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
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();
  const status = statusOf(user);

  async function act(fn: () => Promise<unknown>, message: string, changed = false) {
    const r = await a.run(async () => (await fn(), true), message);
    if (r && changed) onChanged();
  }

  async function remove() {
    if (!(await confirm({ title: t("users.account.deleteTitle"), message: t("users.account.confirmDelete", { email: user.email }), confirmLabel: t("common.delete") }))) return;
    const done = await a.run(async () => (await api.deleteUser(user.id), true));
    if (done) navigate("/users", { state: { deleted: user.email } });
  }

  async function reject() {
    if (!(await confirm({ title: t("users.account.rejectTitle"), message: t("users.account.confirmReject", { email: user.email }), confirmLabel: t("users.account.reject") }))) return;
    const done = await a.run(async () => (await api.rejectUser(user.id), true));
    if (done) navigate("/users", { state: { deleted: user.email } });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("users.account.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <dt className="text-muted-foreground">{t("users.account.status")}</dt>
            <dd>
              <StatusBadge user={user} />
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-muted-foreground">{t("users.account.lastLogin")}</dt>
            <dd>{formatDateTime(user.lastLoginAt, i18n.resolvedLanguage ?? "en") ?? t("users.never")}</dd>
          </div>
        </dl>
        {status === "pending" ? <p className="text-sm text-muted-foreground">{t("users.account.pendingHint")}</p> : null}
        {status === "awaiting_approval" ? (
          <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="approval-panel">
            <p className="text-sm">{t("users.account.awaitingHint")}</p>
            <Can perm={P.identity.userApprove}>
              <SplitButton
                size="default"
                busy={a.busy}
                menuLabel={t("users.account.moreDecisions")}
                actions={[
                  { key: "approve", label: t("users.account.approve"), icon: Check, onSelect: () => void act(() => api.approveUser(user.id), t("users.account.approved"), true) },
                  { key: "reject", label: t("users.account.reject"), icon: X, destructive: true, onSelect: () => void reject() },
                ]}
              />
            </Can>
          </div>
        ) : null}
        <Can perm={P.identity.userWrite}>
          <div className="divide-y rounded-lg border">
            {status === "awaiting_approval" ? null : (
              <ActionRow title={status === "pending" ? t("users.account.welcomeTitle") : t("users.account.resetTitle")} hint={status === "pending" ? t("users.account.welcomeHint") : t("users.account.resetHint")}>
                {status === "pending" ? (
                  <Button variant="outline" busy={a.busy} onClick={() => void act(() => api.sendWelcome(user.id), t("users.account.welcomeSent"))}>
                    {t("users.account.resendWelcome")}
                  </Button>
                ) : (
                  <Button variant="outline" busy={a.busy} onClick={() => void act(() => api.sendReset(user.id), t("users.account.resetSent"))}>
                    {t("users.account.sendReset")}
                  </Button>
                )}
              </ActionRow>
            )}
            <ActionRow title={t("users.account.accessTitle")} hint={user.disabled ? t("users.account.accessHintDisabled") : t("users.account.accessHint")}>
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
            </ActionRow>
            <ActionRow title={t("users.account.deleteTitle")} hint={t("users.account.deleteHint")} danger>
              <Button variant="destructive" busy={a.busy} onClick={() => void remove()}>
                {t("users.account.delete")}
              </Button>
            </ActionRow>
          </div>
        </Can>
        <ErrorAlert error={a.error} />
        <DoneAlert watch={a.doneId}>{a.done}</DoneAlert>
        {dialog}
      </CardContent>
    </Card>
  );
}

/** One line of the account actions: what it does on the left, its button on the right (below the text on a phone). */
function ActionRow({ title, hint, danger, children }: { title: string; hint: string; danger?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex flex-col">
        <span className={danger ? "text-sm font-medium text-destructive" : "text-sm font-medium"}>{title}</span>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
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
  const canWrite = can(P.identity.userWrite);

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
            <AvatarUpload name={name} email={email} current={user?.avatar} value={avatar} onChange={setAvatar} disabled={!canWrite} labels={avatarLabels(t)} />
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
        <Can perm={P.identity.roleRead}>
          <Card>
            <CardHeader>
              <CardTitle>{t("users.roles.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RoleCards selected={roles} onChange={setRoles} disabled={!canWrite || (editing && !can(P.identity.roleWrite))} />
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
      <Can perm={P.dictionary.settingsRead}>
        <UserStorage userId={data.id} />
      </Can>
      <Can perm={P.identity.mfaRead}>
        <Card>
          <CardContent className="pt-6">
            <UserMfa user={data} onChanged={reload} />
          </CardContent>
        </Card>
      </Can>
    </div>
  );
}
