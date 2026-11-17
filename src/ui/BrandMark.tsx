/** Same drawing as public/favicon.svg: three batch bars filling with rain. */
export default function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="9" fill="#121212" />
      <rect x="8" y="16" width="4" height="9" rx="2" fill="#ff2fb6" />
      <rect x="14" y="10" width="4" height="15" rx="2" fill="#ff2fb6" />
      <rect x="20" y="14" width="4" height="11" rx="2" fill="#ff2fb6" />
      <rect className="drop" x="9" y="8" width="2" height="4" rx="1" />
      <rect className="drop" x="21" y="6" width="2" height="4" rx="1" />
    </svg>
  )
}
