import { Navigate, Route, Routes } from "react-router-dom";
import { Apps } from "./pages/Apps";
import { AccountMfa } from "./pages/AccountMfa";
import { ErrorPage } from "./pages/ErrorPage";
import { Forgot } from "./pages/Forgot";
import { Login } from "./pages/Login";
import { LoginMfa } from "./pages/LoginMfa";
import { LoginPassword } from "./pages/LoginPassword";
import { Logout } from "./pages/Logout";
import { Reset } from "./pages/Reset";

// the paths are the ones identity has always used, so e-mailed links and return_to values keep working
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/login/mfa" element={<LoginMfa />} />
      <Route path="/login/password" element={<LoginPassword />} />
      <Route path="/password/forgot" element={<Forgot />} />
      <Route path="/password/reset" element={<Reset />} />
      <Route path="/account/mfa" element={<AccountMfa />} />
      <Route path="/apps" element={<Apps />} />
      <Route path="/logout" element={<Logout />} />
      <Route path="/error" element={<ErrorPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
