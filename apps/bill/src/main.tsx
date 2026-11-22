import { AuthProvider, createClient, readEnv } from "@huponx/auth-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";

const env = readEnv();
const client = createClient({ apiBase: env.API_BASE });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider client={client}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
