import { useConfirm as useKitConfirm } from "@huponx/ui-kit";
import { useTranslation } from "react-i18next";

/** The confirmation dialog of the kit with the texts of the admin (see `useConfirm` in ui-kit). */
export function useConfirm() {
  const { t } = useTranslation();
  return useKitConfirm({ title: t("common.confirmTitle"), confirm: t("common.confirm"), cancel: t("common.cancel"), close: t("common.close") });
}
