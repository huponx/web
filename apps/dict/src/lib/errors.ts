import { ApiError } from "@huponx/auth-client";
import type { TFunction } from "i18next";
import { serviceCode } from "../api";
import { ImageError } from "./image";

/** A message the user can act on for an error of the dictionary routes. */
export function errorMessage(e: unknown, t: TFunction): string {
  switch (serviceCode(e)) {
    case "MAX_SAVED_WORDS_REACHED":
      return t("errors.limit");
    case "NO_WORDS_TO_EXPORT":
      return t("errors.nothingToExport");
    case "EXPORT_TOO_LARGE":
      return t("errors.tooLarge");
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
  }
  if (e instanceof ImageError) return t(e.problem === "tooLarge" ? "errors.imageTooLarge" : "errors.imageFormat");
  if (e instanceof ApiError) {
    if (e.code === "not_found") return t("errors.notFound");
    if (e.code === "unavailable" || e.code === "timeout") return t("errors.unavailable");
    if (e.code === "forbidden") return t("errors.forbidden");
    if (e.message) return e.message;
  }
  if (e instanceof Error && e.message) return e.message;
  return t("common.somethingWrong");
}
