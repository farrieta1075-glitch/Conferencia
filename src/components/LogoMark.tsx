export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#0B132B" />
      <path
        d="M8 48 C18 22, 46 22, 56 48"
        fill="none"
        stroke="#9A6B43"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M14 48 C22 30, 42 30, 50 48"
        fill="none"
        stroke="#F8FAFC"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M20 48 C26 36, 38 36, 44 48"
        fill="#1C2541"
        stroke="#9A6B43"
        strokeWidth="1.5"
      />
      <rect x="24" y="46" width="16" height="5" rx="1.5" fill="#9A6B43" />
    </svg>
  );
}
