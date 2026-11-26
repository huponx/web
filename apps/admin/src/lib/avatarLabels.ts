import type { AvatarUploadLabels } from "@huponx/ui-kit";
import type { TFunction } from "i18next";

/** The texts of the avatar control, from the `users.avatar.*` keys. */
export function avatarLabels(t: TFunction): AvatarUploadLabels {
  return {
    file: t("users.avatar.file"),
    upload: t("users.avatar.upload"),
    remove: t("users.avatar.remove"),
    hint: (side) => t("users.avatar.hint", { side }),
    size: (kb) => t("users.avatar.size", { kb }),
    error: {
      type: t("users.avatar.error.type"),
      size: t("users.avatar.error.size"),
      decode: t("users.avatar.error.decode"),
      encode: t("users.avatar.error.encode"),
    },
    crop: {
      title: t("users.avatar.cropTitle"),
      hint: t("users.avatar.cropHint"),
      zoom: t("users.avatar.zoom"),
      cancel: t("common.cancel"),
      use: t("users.avatar.cropUse"),
      close: t("common.close"),
    },
  };
}
