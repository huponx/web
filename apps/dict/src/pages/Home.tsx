import { useAuth } from "@huponx/auth-client";
import { Badges, Card, PageTitle } from "@huponx/ui";

export function Home() {
  const { user } = useAuth();
  return (
    <>
      <PageTitle>Dict</PageTitle>
      <Card>
        <p>
          Signed in as <strong>{user?.sub}</strong>.
        </p>
        <p>Roles</p>
        <p>
          <Badges items={user?.roles} />
        </p>
        <p>Permissions</p>
        <p>
          <Badges items={user?.perms} />
        </p>
      </Card>
    </>
  );
}
