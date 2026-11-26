import { ApiError } from "@huponx/auth-client";
import { translateApiError } from "@huponx/ui-kit";
import type { TFunction } from "i18next";
import { serviceCode } from "../api";
import i18n from "../i18n";
import { AudioError } from "./audio";
import { ImageError } from "./image";

/**
 * An error text of the app itself ("The word is empty."). Keep it, not the translated string, in the state of a
 * component, and show it with `errorMessage` at render: the text then follows a change of the language.
 */
export class Localized {
  constructor(
    readonly key: string,
    readonly options?: Record<string, unknown>,
  ) {}
}

/** A message the user can act on for an error of the dictionary routes (translate at render, not when it happens). */
export function errorMessage(e: unknown, t: TFunction): string {
  if (e instanceof Localized) return t(e.key, { ...e.options });
  // the stable reason of the server first (`errors.reason.*`), then the service code the message starts with
  const reason = e instanceof ApiError && e.reason && i18n.exists(`errors.reason.${e.reason}`);
  if (reason) return translateApiError(e, { t, exists: (k) => i18n.exists(k) }, t("common.somethingWrong")) ?? "";
  switch (serviceCode(e)) {
    case "MAX_SAVED_WORDS_REACHED":
      return t("errors.limit");
    case "SAVED_BYTES_EXCEEDED":
      return t("errors.bytesLimit");
    case "NO_WORDS_TO_EXPORT":
      return t("errors.nothingToExport");
    case "EXPORT_TOO_LARGE":
      return t("errors.tooLarge");
    case "EXPORT_USE_JOB":
      return t("errors.useJob");
    case "FEATURE_DISABLED":
      return t("errors.featureDisabled");
    case "DICTIONARY_DISABLED":
      return t("errors.dictionaryDisabled");
    case "IMAGE_TOO_LARGE":
      return t("errors.imageTooLarge");
    case "IMAGE_UNSUPPORTED":
      return t("errors.imageFormat");
    case "IMAGE_QUOTA_EXCEEDED":
      return t("errors.imageQuota");
    case "IMAGES_DISABLED":
      return t("errors.imagesDisabled");
    case "AUDIO_TOO_LARGE":
      return t("errors.audioTooLarge");
    case "AUDIO_UNSUPPORTED":
      return t("errors.audioFormat");
    case "AUDIO_QUOTA_EXCEEDED":
      return t("errors.audioQuota");
    case "AUDIO_DISABLED":
      return t("errors.audioDisabled");
    case "AUDIO_NOT_FOUND":
      return t("errors.audioNotFound");
    case "CATEGORY_LIMIT_REACHED":
      return t("errors.categoryLimit");
    case "CATEGORY_EXISTS":
      return t("errors.categoryExists");
  }
  if (e instanceof AudioError)
    return t(
      e.problem === "tooLarge" ? "errors.audioTooLarge" : "errors.audioFormat",
    );
  if (e instanceof ImageError)
    return t(
      e.problem === "tooLarge" ? "errors.imageTooLarge" : "errors.imageFormat",
    );
  if (e instanceof ApiError) {
    return translateApiError(e, { t, exists: (k) => i18n.exists(k) }, t("common.somethingWrong")) ?? "";
  }
  if (e instanceof Error && e.message) return e.message;
  return t("common.somethingWrong");
}
