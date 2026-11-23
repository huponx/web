import { Button } from "@huponx/ui-kit";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Actions, TextField } from "./common";

/** A search the backend answers: the text is sent when Search is pressed (or Enter), Clear empties it. */
export function SearchBar({ label, hint, onSearch }: { label: string; hint?: string; onSearch: (query: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  return (
    <form
      role="search"
      className="flex flex-col gap-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        onSearch(text.trim());
      }}
    >
      <TextField label={label} value={text} onChange={(e) => setText(e.target.value)} onClear={() => setText("")} hint={hint} />
      <Actions>
        <Button type="submit" variant="outline">
          {t("common.search")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setText("");
            onSearch("");
          }}
        >
          {t("common.clearSearch")}
        </Button>
      </Actions>
    </form>
  );
}
