import { useId } from "react";

/**
 * Logo of the bill app: a receipt with lines, one of them amber. It uses the primary color of the theme, so it works
 * in light and dark. The same drawing is `public/logo.svg` (favicon).
 */
export function BillLogo({ className = "size-8", title }: { className?: string; title?: string }) {
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
      <path d="M10 7h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5V7Z" fill="var(--primary-foreground)" />
      <rect x="12.5" y="11" width="7" height="1.8" rx=".9" fill="#f5b942" />
      <rect x="12.5" y="14.8" width="7" height="1.8" rx=".9" fill="var(--primary)" fillOpacity=".55" />
      <rect x="12.5" y="18.6" width="4.5" height="1.8" rx=".9" fill="var(--primary)" fillOpacity=".55" />
    </svg>
  );
}
