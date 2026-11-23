import { useId } from "react";

/**
 * Logo of the admin app: a shield with a key hole. It uses the primary color and `currentColor` for the
 * key hole, so it works in light and dark. The same drawing is `apps/admin/public/logo.svg` (favicon).
 */
export function Logo({ className = "size-8", title }: { className?: string; title?: string }) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? id : undefined}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title id={id}>{title}</title> : null}
      <path
        d="M16 2.5 4.5 6.8v8.1c0 7.1 4.8 12.4 11.5 14.6 6.7-2.2 11.5-7.5 11.5-14.6V6.8L16 2.5Z"
        fill="var(--primary)"
      />
      <circle cx="16" cy="13.2" r="3.4" fill="var(--primary-foreground)" />
      <path d="M14.4 15.6h3.2l1 7.2h-5.2l1-7.2Z" fill="var(--primary-foreground)" />
    </svg>
  );
}
