import { useAuth } from "@huponx/auth-client";
import { BadgeList, Card, CardContent, PageTitle } from "@huponx/ui-kit";
import { Trans, useTranslation } from "react-i18next";

export function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <>
      <PageTitle>{t("home.title")}</PageTitle>
      <Card>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            <Trans i18nKey="home.signedInAs" values={{ who: user?.sub }} components={{ strong: <strong /> }} />
          </p>
          <p className="text-muted-foreground">{t("home.roles")}</p>
          <BadgeList items={user?.roles} />
          <p className="text-muted-foreground">{t("home.permissions")}</p>
          <BadgeList items={user?.perms} />
        </CardContent>
      </Card>
    </>
  );
}
