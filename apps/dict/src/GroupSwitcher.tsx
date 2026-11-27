import { ToggleGroup, ToggleGroupItem } from "@huponx/ui-kit";
import { useTranslation } from "react-i18next";
import { groupLabel, useRegistry } from "./lib/registry";

/** Picks the group of dictionaries the page works in (Lookup, Saved words, Review); nothing when there is one group. */
export function GroupSwitcher() {
  const { t } = useTranslation();
  const { groups, group, setGroup } = useRegistry();
  if (groups.length < 2) return null;
  return (
    <ToggleGroup
      type="single"
      role="group"
      aria-label={t("lookup.group")}
      value={group}
      onValueChange={(v) => v && setGroup(v)}
    >
      {groups.map((g) => (
        <ToggleGroupItem key={g.id} value={g.id} className="w-auto px-3 text-sm">
          {groupLabel(t, g.id)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
