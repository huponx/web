import { useAuth } from "@huponx/auth-client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DEFAULT_SYSTEM, DEFAULT_USER, useDictionary } from "../api";
import type { MySettings, UserSettings } from "../api";

interface Value {
  settings: MySettings;
  /** The settings were read (or reading failed and the defaults stand). */
  loaded: boolean;
  /** Stores the preferences; rejects when the service refuses them. */
  save: (user: UserSettings) => Promise<MySettings>;
}

const DEFAULTS: MySettings = { user: DEFAULT_USER, system: DEFAULT_SYSTEM };

const SettingsContext = createContext<Value>({ settings: DEFAULTS, loaded: true, save: () => Promise.reject(new Error("no settings provider")) });

/**
 * The settings of the dictionary (system and own preferences), read once above the routes so the pages apply
 * them without each asking again. A failed read leaves the defaults: the service still enforces its limits.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  const api = useDictionary();
  const allowed = can("dictionary:word:read");
  const [settings, setSettings] = useState<MySettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(!allowed);

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    api
      .getSettings()
      .then((s) => live && setSettings(s))
      .catch(() => undefined)
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [api, allowed]);

  const save = useCallback(
    async (user: UserSettings) => {
      const s = await api.saveSettings(user);
      setSettings(s);
      return s;
    },
    [api],
  );

  const value = useMemo(() => ({ settings, loaded, save }), [settings, loaded, save]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Value {
  return useContext(SettingsContext);
}
