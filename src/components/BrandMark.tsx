export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="#1a120c" stroke="#ff6a1a" strokeWidth="2" />
      <circle cx="16" cy="16" r="7" fill="#ff6a1a" />
      <circle cx="16" cy="16" r="11" fill="none" stroke="#ffd166" strokeWidth="1" opacity="0.5" />
    </svg>
  )
}
