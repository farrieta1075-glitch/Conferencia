export function CardIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </svg>
  );
}

export function CashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <ellipse cx="8.2" cy="15.2" rx="5.2" ry="3.6" />
      <path d="M3 15.2v1.6c0 2 2.3 3.6 5.2 3.6s5.2-1.6 5.2-3.6V15.2" />
      <ellipse cx="15.4" cy="10.4" rx="5.2" ry="3.6" />
      <path d="M10.2 10.4v1.6c0 2 2.3 3.6 5.2 3.6s5.2-1.6 5.2-3.6v-1.6" />
      <ellipse cx="11.5" cy="6.4" rx="5.2" ry="3.6" />
    </svg>
  );
}
