import { Can, P, RequireAuth, useAuth } from "@huponx/auth-client";
import {
  AppShell,
  Button,
  systemStyleOf,
  useSystemStyle,
} from "@huponx/ui-kit";
import type {
  Crumb,
  SystemStyleReply,
  NavItem,
  ShellLabels,
  ShellLink,
} from "@huponx/ui-kit";
import {
  BookMarked,
  GraduationCap,
  Search,
  Settings as SettingsIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { AccountMenu } from "./AccountMenu";
import { DictLogo } from "./Logo";
import { Lookup, LookupMemoProvider } from "./pages/Lookup";
import { RegistryProvider } from "./lib/registry";
import { SettingsProvider } from "./lib/settings";
import { RemovePrompt } from "./RemovePrompt";
import { Review } from "./pages/Review";
import { Saved } from "./pages/Saved";
import { Settings } from "./pages/Settings";

// NavLink of React Router fits the link of the shell
const link = NavLink as unknown as ShellLink;

function Message({ children }: { children: React.ReactNode }) {
  return <p className="py-12 text-center text-muted-foreground">{children}</p>;
}

/** Applies the style the administrator picked for the whole system (the cached one is used until it arrives). */
function SystemStyle() {
  const { client } = useAuth();
  useSystemStyle(() =>
    client.api<SystemStyleReply>("GET", "/api/ui-style").then(systemStyleOf),
  );
  return null;
}

function Shell() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { pathname } = useLocation();

  // the menu only shows what the user may use; the gateway checks the permission again
  const items: NavItem[] = [];
  if (can(P.dictionary.wordRead)) {
    items.push({
      to: "/",
      label: t("nav.lookup"),
      icon: Search,
      end: true,
      testId: "nav-lookup",
    });
    items.push({
      to: "/saved",
      label: t("nav.saved"),
      icon: BookMarked,
      testId: "nav-saved",
    });
    items.push({
      to: "/review",
      label: t("nav.review"),
      icon: GraduationCap,
      testId: "nav-review",
    });
  }

  // pinned to the bottom of the sidebar, like the admin app
  const bottomItems: NavItem[] = can(P.dictionary.wordRead)
    ? [
        {
          to: "/settings",
          label: t("nav.settings"),
          icon: SettingsIcon,
          testId: "nav-settings",
        },
      ]
    : [];

  const breadcrumbs: Crumb[] = [
    { label: t("nav.home"), to: pathname === "/" ? undefined : "/" },
    ...(pathname === "/saved" ? [{ label: t("nav.saved") }] : []),
    ...(pathname === "/review" ? [{ label: t("nav.review") }] : []),
    ...(pathname === "/settings" ? [{ label: t("nav.settings") }] : []),
  ];

  const labels: ShellLabels = {
    navigation: t("shell.navigation"),
    collapse: t("shell.collapse"),
    expand: t("shell.expand"),
    openMenu: t("shell.openMenu"),
    closeMenu: t("shell.closeMenu"),
    backToTop: t("shell.backToTop"),
    breadcrumb: t("shell.breadcrumb"),
    theme: {
      group: t("shell.theme.group"),
      light: t("shell.theme.light"),
      dark: t("shell.theme.dark"),
      system: t("shell.theme.system"),
    },
  };

  const denied = <Message>{t("common.notAllowed")}</Message>;
  return (
    <SettingsProvider>
      <RegistryProvider>
        <RemovePrompt />
        <LookupMemoProvider>
          <AppShell
            pageKey={pathname}
            brand={t("shell.brand")}
            logo={<DictLogo />}
            items={items}
            bottomItems={bottomItems}
            breadcrumbs={breadcrumbs}
            link={link}
            labels={labels}
            userMenu={<AccountMenu />}
          >
            <Routes>
              <Route
                path="/"
                element={
                  <Can perm={P.dictionary.wordRead} fallback={denied}>
                    <Lookup />
                  </Can>
                }
              />
              <Route
                path="/saved"
                element={
                  <Can perm={P.dictionary.wordRead} fallback={denied}>
                    <Saved />
                  </Can>
                }
              />
              <Route
                path="/review"
                element={
                  <Can perm={P.dictionary.wordRead} fallback={denied}>
                    <Review />
                  </Can>
                }
              />
              <Route
                path="/settings"
                element={
                  <Can perm={P.dictionary.wordRead} fallback={denied}>
                    <Settings />
                  </Can>
                }
              />
              <Route
                path="*"
                element={<Message>{t("common.notFound")}</Message>}
              />
            </Routes>
          </AppShell>
        </LookupMemoProvider>
      </RegistryProvider>
    </SettingsProvider>
  );
}

export function App() {
  const { t } = useTranslation();
  return (
    <RequireAuth
      loading={<Message>{t("common.signingIn")}</Message>}
      signingOut={<Message>{t("common.signingOut")}</Message>}
      error={({ message, retry }) => (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <p>{message}</p>
          <Button onClick={retry}>{t("common.tryAgain")}</Button>
        </div>
      )}
    >
      <SystemStyle />
      <Shell />
    </RequireAuth>
  );
}
