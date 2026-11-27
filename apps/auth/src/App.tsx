import { translateApiError, UiMessagesProvider, useSystemStyle } from "@huponx/ui-kit";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes } from "react-router-dom";
import { authApi } from "./api";
import { AccountMfa } from "./pages/AccountMfa";
import { ErrorPage } from "./pages/ErrorPage";
import { Forgot } from "./pages/Forgot";
import { Login } from "./pages/Login";
import { LoginMfa } from "./pages/LoginMfa";
import { LoginPassword } from "./pages/LoginPassword";
import { Logout } from "./pages/Logout";
import { Register } from "./pages/Register";
import { Reset } from "./pages/Reset";

// the paths are the ones identity has always used, so e-mailed links and return_to values keep working
/** Applies the look an administrator picked for the whole system (no session needed). */
function SystemStyle() {
  useSystemStyle(() => authApi.uiStyle());
  return null;
}

export function App() {
  const { t, i18n } = useTranslation();
  // the texts of the shared components of the kit (field errors, ...) in the language of the app
  const messages = {
    somethingWrong: t("common.somethingWrong"),
    apiError: (e: unknown) => translateApiError(e, i18n, t("common.somethingWrong")),
    required: t("common.required"),
    invalidEmail: t("common.invalidEmail"),
    invalidFormat: t("common.invalidFormat"),
    clearField: (label: string) => t("common.clearField", { label }),
  };
  return (
    <UiMessagesProvider value={messages}>
    <SystemStyle />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/login/mfa" element={<LoginMfa />} />
      <Route path="/login/password" element={<LoginPassword />} />
      <Route path="/register" element={<Register />} />
      <Route path="/password/forgot" element={<Forgot />} />
      <Route path="/password/reset" element={<Reset />} />
      <Route path="/password/set" element={<Reset first />} />
      <Route path="/account/mfa" element={<AccountMfa />} />
      <Route path="/logout" element={<Logout />} />
      <Route path="/error" element={<ErrorPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </UiMessagesProvider>
  );
}
