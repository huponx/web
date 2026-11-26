import { AuthProvider, createClient, readEnv } from "@huponx/auth-client";
import { StyleProvider, ThemeProvider } from "@huponx/ui-kit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./i18n";
import "./index.css";

const env = readEnv();
const client = createClient({ apiBase: env.API_BASE });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <StyleProvider>
        <AuthProvider client={client}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </StyleProvider>
    </ThemeProvider>
  </StrictMode>,
);
