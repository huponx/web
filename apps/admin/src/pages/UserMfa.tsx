import { Can } from "@huponx/auth-client";
import { Button, useAction, useLoad } from "@huponx/ui-kit";
import { Trans, useTranslation } from "react-i18next";
import { useIdentity } from "../api";
import type { User } from "../api";
import { useConfirm } from "../components/ConfirmDialog";
import { Actions, DoneAlert, ErrorAlert, Loading } from "../components/common";
import { ROUTES } from "../authz";

export function UserMfa({ user, onChanged }: { user: User; onChanged: () => void }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const { data, error, loading, reload } = useLoad(() => api.getMfa(user.id), [api, user.id, user.mfaEnabled, user.mfaEnforced]);
  const a = useAction();
  const { confirm, dialog } = useConfirm();

  async function act(fn: () => Promise<unknown>, message: string) {
    const r = await a.run(async () => (await fn(), true), message);
    if (r) {
      reload();
      onChanged();
    }
  }

  return (
    <section aria-label={t("users.mfa.title")} className="flex flex-col gap-3">
      <h3 className="font-medium">{t("users.mfa.title")}</h3>
      <ErrorAlert error={error} />
      {loading ? <Loading /> : null}
      {data ? (
        <p className="text-sm" data-testid="mfa-state">
          <Trans
            i18nKey="users.mfa.state"
            values={{
              mode: data.mode,
              enrolled: data.enabled ? t("users.mfa.enrolledYes") : t("users.mfa.enrolledNo"),
              required: data.enforced ? t("users.mfa.requiredYes") : t("users.mfa.requiredNo"),
              left: data.recoveryCodesLeft,
              passkeys: data.passkeyCount ?? 0,
            }}
            components={{ strong: <strong /> }}
          />
        </p>
      ) : null}
      <Can route={ROUTES.putUserMfa}>
        <Actions className="justify-start">
          <Button
            variant="outline"
            busy={a.busy}
            onClick={() =>
              void act(
                () => api.enforceMfa(user.id, !data?.enforced),
                data?.enforced ? t("users.mfa.notRequired") : t("users.mfa.required"),
              )
            }
          >
            {data?.enforced ? t("users.mfa.stopRequire") : t("users.mfa.require")}
          </Button>
          {data?.enabled ? (
            <Button variant="outline" busy={a.busy} onClick={() => void act(() => api.setMfa(user.id, false), t("users.mfa.turnedOff"))}>
              {t("users.mfa.turnOff")}
            </Button>
          ) : null}
          <Button
            variant="destructive"
            busy={a.busy}
            onClick={async () => {
              if (await confirm({ title: t("users.mfa.reset"), message: t("users.mfa.confirmReset"), confirmLabel: t("users.mfa.reset") })) {
                await act(() => api.resetMfa(user.id), t("users.mfa.resetDone"));
              }
            }}
          >
            {t("users.mfa.reset")}
          </Button>
        </Actions>
        <p className="text-xs text-muted-foreground">{t("users.mfa.hint")}</p>
      </Can>
      <ErrorAlert error={a.error} />
      <DoneAlert watch={a.doneId}>{a.done}</DoneAlert>
      {dialog}
    </section>
  );
}
