/**
 * The mark of the sign in pages: two M letters sharing a stem, a warm shadow behind the white strokes, on a
 * gradient tile. Same drawing as public/logo.svg (the favicon).
 */
export function MmLogo({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className={className} role="img" aria-label="MM">
      <defs>
        <linearGradient id="mm-bg" x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="0.55" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#db2777" />
        </linearGradient>
        <linearGradient id="mm-fg" x1="5" y1="9" x2="27" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e0e7ff" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8.5" fill="url(#mm-bg)" />
      <path d="M3 5.5c6-4 20-4 26 0" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="1.4" strokeLinecap="round" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.8 24.2V10.2L11 18l5.2-7.8L21.4 18l5.2-7.8v14M16.2 10.2v14" stroke="#fbbf24" strokeWidth="2.6" strokeOpacity=".95" />
        <path d="M5 23V9l5.5 8L16 9l5.5 8L27 9v14M16 9v14" stroke="url(#mm-fg)" strokeWidth="2.6" />
      </g>
    </svg>
  );
}
