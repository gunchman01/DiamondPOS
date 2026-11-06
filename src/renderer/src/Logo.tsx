/** The Diamond POS logo: red diamond with a white "P" (same drawing as build/logo.svg, which the app icon is made from) */
export default function Logo({ size = 28 }: { size?: number }) {
  const P = 'M92 66 H146 A38 38 0 0 1 146 142 H128 V190 H92 Z M128 94 H143 A10 10 0 0 1 143 114 H128 Z'
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} aria-label="Diamond POS" role="img" className="logo">
      <defs>
        <linearGradient id="dp-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d4202a" />
          <stop offset="0.55" stopColor="#a50f18" />
          <stop offset="1" stopColor="#6e070d" />
        </linearGradient>
        <linearGradient id="dp-p" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e4e4e4" />
        </linearGradient>
      </defs>
      <polygon points="128,4 252,128 128,252 4,128" fill="#5c050b" />
      <polygon points="128,4 252,128 240,128 128,16 16,128 4,128" fill="#e8434a" />
      <polygon points="128,16 240,128 128,240 16,128" fill="url(#dp-face)" />
      <g fillRule="evenodd" transform="translate(-7,0)">
        <path transform="translate(9,9)" fill="#3a0306" opacity="0.55" d={P} />
        <path transform="translate(5,5)" fill="#9a9a9a" d={P} />
        <path fill="url(#dp-p)" stroke="#bdbdbd" strokeWidth="1.5" d={P} />
      </g>
    </svg>
  )
}
