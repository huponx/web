import type { SessionsPanelLabels } from "@huponx/ui-kit";
import type { TFunction } from "i18next";

/** The texts of the sessions list, from the `sessions.*` keys. */
export function sessionsLabels(t: TFunction): SessionsPanelLabels {
  return {
    none: t("sessions.none"),
    thisDevice: t("sessions.thisDevice"),
    unknownDevice: t("sessions.unknownDevice"),
    browserOnOs: (browser, os) => t("sessions.browserOnOs", { browser, os }),
    lastActive: (when) => t("sessions.lastActive", { when }),
    signedIn: (date) => t("sessions.signedIn", { date }),
    password: t("sessions.password"),
    otp: t("sessions.otp"),
    passkey: t("sessions.passkey"),
    actions: (name) => t("sessions.actions", { name }),
    revoke: t("sessions.revoke"),
    revokeOthers: t("sessions.revokeOthers"),
    confirmRevoke: (name) => t("sessions.confirmRevoke", { name }),
    confirmRevokeCurrent: (name) => t("sessions.confirmRevokeCurrent", { name }),
    confirmRevokeOthers: t("sessions.confirmRevokeOthers"),
    confirm: { title: t("common.confirmTitle"), confirm: t("common.confirm"), cancel: t("common.cancel"), close: t("common.close") },
  };
}
