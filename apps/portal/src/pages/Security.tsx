import { useAuth } from "@huponx/auth-client";
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ErrorAlert, PageTitle, TextField, useAction } from "@huponx/ui-kit";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../api";
import { Mfa } from "./Mfa";

function ChangePassword() {
  const { t } = useTranslation();
  const api = useIdentity();
  const { reload } = useAuth();
  const a = useAction();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [changed, setChanged] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (next !== again) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    const ok = await a.run(() => api.changePassword(current, next).then(() => true));
    if (ok) {
      // identity ended every session of the user, this one too: the form gives way to the way back in
      setChanged(true);
      setCurrent("");
      setNext("");
      setAgain("");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("security.password.title")}</CardTitle>
        <CardDescription>{t("security.password.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {changed ? (
          <div className="flex flex-col gap-4">
            <Alert variant="success">{t("security.password.done")}</Alert>
            <div className="flex justify-end">
              <Button onClick={reload}>{t("security.password.signIn")}</Button>
            </div>
          </div>
        ) : (
          <form className="flex max-w-md flex-col gap-4" onSubmit={(ev) => void submit(ev)}>
            <TextField label={t("security.password.current")} type="password" name="current" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            <TextField label={t("security.password.new")} type="password" name="new" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
            <TextField
              label={t("security.password.repeat")}
              type="password"
              name="repeat"
              autoComplete="new-password"
              required
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              error={mismatch ? t("security.password.mismatch") : undefined}
            />
            <ErrorAlert error={a.error} />
            <div className="flex justify-end">
              <Button type="submit" busy={a.busy}>
                {t("security.password.submit")}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function Security() {
  const { t } = useTranslation();
  return (
    <>
      <PageTitle>{t("security.title")}</PageTitle>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ChangePassword />
        <Mfa />
      </div>
    </>
  );
}
