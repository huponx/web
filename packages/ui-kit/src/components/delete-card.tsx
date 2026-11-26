import type { ReactNode } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Actions, ErrorAlert } from "./page-parts";

export interface DeleteCardProps {
  title: string;
  description: string;
  /** Text of the button. */
  label: string;
  onDelete: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** The error of the last try (shown above the button). */
  error?: unknown;
  /** Rendered inside the card, for the dialog of `useConfirm`. */
  children?: ReactNode;
}

/** The card at the end of an edit page with the button that deletes what the page edits. */
export function DeleteCard({ title, description, label, onDelete, disabled, busy, error, children }: DeleteCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorAlert error={error} />
        <Actions>
          <Button variant="destructive" disabled={disabled} busy={busy} onClick={onDelete}>
            {label}
          </Button>
        </Actions>
      </CardContent>
      {children}
    </Card>
  );
}
