import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

/** The texts of the dialog; the kit has no i18n, the app passes them translated. */
export interface ConfirmLabels {
  /** Title when a question has none. */
  title: string;
  /** Label of the button that goes on when a question has none. */
  confirm: string;
  cancel: string;
  /** Accessible name of the X. */
  close: string;
}

export interface ConfirmOptions {
  /** What is about to happen and what it costs. */
  message: string;
  title?: string;
  confirmLabel?: string;
  /** Default true: the actions asked about here destroy something. */
  destructive?: boolean;
}

/**
 * The in-app replacement of window.confirm: `const { confirm, dialog } = useConfirm(labels)`, render
 * `{dialog}` once, then `if (!(await confirm({ message }))) return;`. Closing the dialog (Cancel,
 * Escape, the X, a click outside) answers false.
 */
export function useConfirm(labels: ConfirmLabels): { confirm: (o: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const [options, setOptions] = useState<ConfirmOptions>();
  const resolver = useRef<(ok: boolean) => void>();

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false); // a second question replaces the first
        resolver.current = resolve;
        setOptions(o);
      }),
    [],
  );

  function answer(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = undefined;
    setOptions(undefined);
  }

  const dialog = (
    <Dialog open={!!options} onOpenChange={(open) => !open && answer(false)}>
      <DialogContent closeLabel={labels.close} role="alertdialog">
        <DialogHeader>
          <DialogTitle>{options?.title ?? labels.title}</DialogTitle>
          <DialogDescription>{options?.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => answer(false)}>
            {labels.cancel}
          </Button>
          <Button variant={options?.destructive === false ? "default" : "destructive"} data-testid="confirm-ok" onClick={() => answer(true)}>
            {options?.confirmLabel ?? labels.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { confirm, dialog };
}
