import { useAuth, useNotifications } from "@huponx/auth-client";
import { NotificationBell, bellLabels } from "@huponx/ui-kit";
import type { ShellLink } from "@huponx/ui-kit";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

// NavLink of React Router fits the link of the shell
const link = NavLink as unknown as ShellLink;

/** The route the bell needs: any signed-in user holds it, so the gateway lists it in `allowed` for everybody. */
const LIST = "GET /api/notifications";

function Bell() {
  const { t, i18n } = useTranslation();
  const { client } = useAuth();
  return <NotificationBell state={useNotifications(client)} labels={bellLabels(t)} language={i18n.resolvedLanguage ?? "en"} link={link} />;
}

/** The bell of the header, the same in every app. Nothing is read or opened for a user the gateway does not list the route for. */
export function Notifications() {
  const { can } = useAuth();
  return can(LIST) ? <Bell /> : null;
}
