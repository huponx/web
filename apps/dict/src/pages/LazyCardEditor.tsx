import { Loading } from "@huponx/ui-kit";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { CardEditorProps } from "./CardEditor";

// Tiptap is large: it loads when the first card is edited
const Editor = lazy(() => import("./CardEditor"));

export function CardEditor(props: CardEditorProps) {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<Loading label={t("editor.loading")} />}>
      <Editor {...props} />
    </Suspense>
  );
}
