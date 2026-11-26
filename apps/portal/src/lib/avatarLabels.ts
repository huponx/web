import type { AvatarUploadLabels } from "@huponx/ui-kit";
import type { TFunction } from "i18next";

/** The texts of the avatar control, from the `profile.avatar.*` keys. */
export function avatarLabels(t: TFunction): AvatarUploadLabels {
  return {
    file: t("profile.avatar.file"),
    upload: t("profile.avatar.upload"),
    remove: t("profile.avatar.remove"),
    hint: (side) => t("profile.avatar.hint", { side }),
    size: (kb) => t("profile.avatar.size", { kb }),
    error: {
      type: t("profile.avatar.error.type"),
      size: t("profile.avatar.error.size"),
      decode: t("profile.avatar.error.decode"),
      encode: t("profile.avatar.error.encode"),
    },
    crop: {
      title: t("profile.avatar.cropTitle"),
      hint: t("profile.avatar.cropHint"),
      zoom: t("profile.avatar.zoom"),
      cancel: t("common.cancel"),
      use: t("profile.avatar.cropUse"),
      close: t("common.close"),
    },
  };
}
