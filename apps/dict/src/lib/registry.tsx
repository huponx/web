import { useAuth } from "@huponx/auth-client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import { dictionaryOn, useDictionary } from "../api";
import type { DictionaryGroup, DictionaryInfo } from "../api";
import { useSettings } from "./settings";
import { ROUTES } from "../authz";

/** The name of a dictionary for the screen: `lookup.dictionaries.<id>`, the id itself when there is no translation. */
export const dictionaryLabel = (t: TFunction, id: string): string =>
  t(`lookup.dictionaries.${id}`, { defaultValue: id });

/** The name of a group: `lookup.groups.<id>`, the id itself when there is no translation. */
export const groupLabel = (t: TFunction, id: string): string =>
  t(`lookup.groups.${id}`, { defaultValue: id });

interface Value {
  /** Every group of the registry, in its order. */
  all: DictionaryGroup[];
  /** The groups the switchers offer: the ones with a dictionary that is on for the user (all, when none is). */
  groups: DictionaryGroup[];
  /** The registry was read (or reading failed, or the user may not read it). */
  loaded: boolean;
  /** The group the pages work in. Empty until the registry is read. */
  group: string;
  setGroup: (id: string) => void;
  /** The dictionary is on for the system and for the user. */
  enabled: (id: string) => boolean;
  /** The dictionaries of the active group, in the order of the registry. */
  dictionaries: DictionaryInfo[];
}

const RegistryContext = createContext<Value>({
  all: [],
  groups: [],
  loaded: true,
  group: "",
  setGroup: () => undefined,
  enabled: () => true,
  dictionaries: [],
});

/**
 * The registry of dictionaries (`GET /api/dictionary/dictionaries`), read once above the routes, and the group the
 * pages work in. The group starts as the one of the default dictionary of the user; what the user picks in a group
 * switcher holds on every page until they pick another.
 */
export function RegistryProvider({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  const api = useDictionary();
  const { settings } = useSettings();
  const allowed = can(ROUTES.listSaved);
  const [all, setAll] = useState<DictionaryGroup[]>([]);
  const [loaded, setLoaded] = useState(!allowed);
  const [picked, setPicked] = useState<string>();

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    api
      .listDictionaries()
      .then(
        (g) => {
          if (!live) return;
          // together: a page must not see a group before the registry counts as read
          setAll(g);
          setLoaded(true);
        },
        // the pages say that no dictionary is available
        () => live && setLoaded(true),
      );
    return () => {
      live = false;
    };
  }, [api, allowed]);

  const { system, user } = settings;
  const enabled = useCallback(
    (id: string) =>
      dictionaryOn(system.dictionaries, id) &&
      dictionaryOn(user.dictionaries, id),
    [system.dictionaries, user.dictionaries],
  );

  const value = useMemo((): Value => {
    const usable = all.filter((g) => g.dictionaries.some((d) => enabled(d.id)));
    const groups = usable.length > 0 ? usable : all;
    const ofDefault = groups.find((g) =>
      g.dictionaries.some(
        (d) => d.id === user.defaultDictionary && enabled(d.id),
      ),
    );
    const group =
      picked && groups.some((g) => g.id === picked)
        ? picked
        : (ofDefault ?? groups[0])?.id ?? "";
    return {
      all,
      groups,
      loaded,
      group,
      setGroup: setPicked,
      enabled,
      dictionaries: groups.find((g) => g.id === group)?.dictionaries ?? [],
    };
  }, [all, loaded, picked, enabled, user.defaultDictionary]);

  return (
    <RegistryContext.Provider value={value}>
      {children}
    </RegistryContext.Provider>
  );
}

export function useRegistry(): Value {
  return useContext(RegistryContext);
}
