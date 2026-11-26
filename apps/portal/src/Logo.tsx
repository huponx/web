import { useId } from "react";

/**
 * Logo of the portal: a grid of four tiles, one of them amber. It uses the primary color of the theme, so it works
 * in light and dark. The same drawing is `public/logo.svg` (favicon).
 */
export function PortalLogo({ className = "size-8", title }: { className?: string; title?: string }) {
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
      <rect x="7.5" y="7.5" width="7.5" height="7.5" rx="2" fill="var(--primary-foreground)" />
      <rect x="17" y="7.5" width="7.5" height="7.5" rx="2" fill="var(--primary-foreground)" fillOpacity=".82" />
      <rect x="7.5" y="17" width="7.5" height="7.5" rx="2" fill="var(--primary-foreground)" fillOpacity=".82" />
      <rect x="17" y="17" width="7.5" height="7.5" rx="2" fill="#f5b942" />
    </svg>
  );
}
