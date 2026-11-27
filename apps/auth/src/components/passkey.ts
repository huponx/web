import { createPasskey, getPasskey, passkeyFailure } from "@huponx/ui-kit";
import { PasskeyError } from "../api";

type Options = Record<string, unknown>;

/**
 * Runs a ceremony of the browser. A dismissed prompt resolves with `undefined` (nothing to show); a refusal throws a
 * `PasskeyError`, whose text the page has.
 */
async function ceremony<T>(run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (err) {
    if (passkeyFailure(err) === "cancelled") return undefined;
    throw new PasskeyError();
  }
}

export const askPasskey = (options: Options, o?: { conditional?: boolean; signal?: AbortSignal }) => ceremony(() => getPasskey(options, o));
export const makePasskey = (options: Options) => ceremony(() => createPasskey(options));
