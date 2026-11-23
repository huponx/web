import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "../components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { useTheme } from "./ThemeProvider";
import type { Theme } from "./ThemeProvider";

export interface ThemeSwitchLabels {
  group: string;
  light: string;
  dark: string;
  system: string;
}

const order: Theme[] = ["light", "dark", "system"];
const icons = { light: Sun, dark: Moon, system: Monitor } as const;

/**
 * One button that shows the current theme as an icon; a click moves to the next one: light, dark, system, light...
 * Labels come from the app (translated).
 */
export function ThemeSwitch({ labels }: { labels: ThemeSwitchLabels }) {
  const { theme, setTheme } = useTheme();
  const Icon = icons[theme];
  const next = order[(order.indexOf(theme) + 1) % order.length] ?? "light";
  const text = `${labels.group}: ${labels[theme]}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={text}
          data-testid="theme-switch"
          data-theme={theme}
          onClick={() => setTheme(next)}
        >
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
