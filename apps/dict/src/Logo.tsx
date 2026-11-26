import { useId } from "react";

/**
 * Logo of the dictionary: an open book with a bookmark. It uses the primary color of the theme, so it works
 * in light and dark. The same drawing is `public/logo.svg` (favicon).
 */
export function DictLogo({
  className = "size-8",
  title,
}: {
  className?: string;
  title?: string;
}) {
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
      <rect x="2" y="2" width="28" height="28" rx="7" fill="var(--primary)" />
      <path
        d="M7.5 9.6c3-1.1 5.9-.7 8.5 1.1v11.9c-2.6-1.8-5.5-2.2-8.5-1.1V9.6Z"
        fill="var(--primary-foreground)"
      />
      <path
        d="M24.5 9.6c-3-1.1-5.9-.7-8.5 1.1v11.9c2.6-1.8 5.5-2.2 8.5-1.1V9.6Z"
        fill="var(--primary-foreground)"
        fillOpacity=".82"
      />
      <path
        d="M20.2 8.2v6.4l1.8-1.4 1.8 1.4V9.3c-.6-.4-1.2-.7-1.8-.9-.6-.2-1.2-.2-1.8-.2Z"
        fill="#f5b942"
      />
    </svg>
  );
}
