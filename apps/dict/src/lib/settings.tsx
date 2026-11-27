import { P, useAuth } from "@huponx/auth-client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { DEFAULT_SYSTEM, DEFAULT_USER, useDictionary } from "../api";
import type { MySettings, UserSettings } from "../api";

interface Value {
  settings: MySettings;
  /** The settings were read (or reading failed and the defaults stand). */
  loaded: boolean;
  /** The settings came from the service (not the defaults of a failed read): safe to write back. */
  known: boolean;
  /** Stores the preferences; rejects when the service refuses them. */
  save: (user: UserSettings) => Promise<MySettings>;
  /** Records when the FSRS parameters were last fitted (after Optimize or Restore): empty `trainedAt` is the defaults. */
  setFsrs: (trainedAt: string, reviewCount: number) => void;
}

const DEFAULTS: MySettings = {
  user: DEFAULT_USER,
  system: DEFAULT_SYSTEM,
  fsrsTrainedAt: "",
  fsrsReviewCount: 0,
};

const SettingsContext = createContext<Value>({
  settings: DEFAULTS,
  loaded: true,
  known: false,
  save: () => Promise.reject(new Error("no settings provider")),
  setFsrs: () => undefined,
});

/**
 * The settings of the dictionary (system and own preferences), read once above the routes so the pages apply
 * them without each asking again. A failed read leaves the defaults: the service still enforces its limits.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  const api = useDictionary();
  const allowed = can(P.dictionary.wordRead);
  const [settings, setSettings] = useState<MySettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(!allowed);
  const [known, setKnown] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    api
      .getSettings()
      .then((s) => {
        if (!live) return;
        setSettings(s);
        setKnown(true);
      })
      .catch(() => undefined)
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [api, allowed]);

  const save = useCallback(
    async (user: UserSettings) => {
      const s = await api.saveSettings(user);
      // the answer of a save does not carry the state of the FSRS parameters: keep what is known
      setSettings((prev) => ({
        ...s,
        fsrsTrainedAt: prev.fsrsTrainedAt,
        fsrsReviewCount: prev.fsrsReviewCount,
      }));
      setKnown(true);
      return s;
    },
    [api],
  );

  const setFsrs = useCallback(
    (fsrsTrainedAt: string, fsrsReviewCount: number) =>
      setSettings((prev) => ({ ...prev, fsrsTrainedAt, fsrsReviewCount })),
    [],
  );

  const value = useMemo(
    () => ({ settings, loaded, known, save, setFsrs }),
    [settings, loaded, known, save, setFsrs],
  );
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): Value {
  return useContext(SettingsContext);
}
