/**
 * Colours of the icon buttons, one per kind of action, so a row of identical grey icons can be told apart at a
 * glance. The icon takes the colour (currentColor) and the hover a soft tint of it; the pairs follow the badges
 * of the admin app (`text-X-700` in light, `text-X-400` in dark).
 */
export const tone = {
  /** edit, rename */
  edit: "text-sky-700 hover:bg-sky-500/15 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-400",
  /** copy, copy a link */
  copy: "text-violet-700 hover:bg-violet-500/15 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-400",
  /** undo, revert */
  revert: "text-amber-700 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-400",
  /** play a sound, confirm */
  ok: "text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400",
  /** delete, remove */
  danger: "text-destructive hover:bg-destructive/10 hover:text-destructive",
} as const;

/** The same colours for the icon of a button that also has a label (the label keeps the colour of the button). */
export const iconTone = {
  copy: "text-violet-700 dark:text-violet-400",
  add: "text-emerald-700 dark:text-emerald-400",
  save: "text-sky-700 dark:text-sky-400",
  /** reload, regenerate */
  refresh: "text-sky-700 dark:text-sky-400",
  edit: "text-sky-700 dark:text-sky-400",
  danger: "text-destructive",
  tags: "text-amber-700 dark:text-amber-400",
} as const;
