export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <path d="M9 21.5a5 5 0 0 1 .6-9.97A7 7 0 0 1 23 12.5a4.5 4.5 0 0 1 0 9z" fill="var(--accent-fg)" />
    </svg>
  )
}
