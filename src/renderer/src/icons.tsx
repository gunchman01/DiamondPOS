// DiamondPOS icon set: simple original line icons (48×48), coloured via CSS `color`.
import type { ReactNode } from 'react'

function Svg({ children, size = 40 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const receipt = 'M13 6h22v36l-3.7-2.5L27.6 42l-3.6-2.5L20.4 42l-3.7-2.5L13 42z'

export const Icons = {
  customers: (
    <Svg>
      <circle cx="18" cy="17" r="6" />
      <path d="M7 38c0-6.5 5-11 11-11s11 4.5 11 11" />
      <circle cx="33" cy="19" r="5" />
      <path d="M31 28.2c.7-.1 1.3-.2 2-.2 5 0 9 3.8 9 9.5" />
    </Svg>
  ),
  makeSale: (
    <Svg>
      <rect x="17" y="8" width="14" height="7" rx="1.5" />
      <path d="M24 15v4" />
      <rect x="7" y="19" width="34" height="13" rx="3" />
      <path d="M13 24h3M22.5 24h3M32 24h3M13 28h3M22.5 28h3M32 28h3" />
      <path d="M5 32h38v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
    </Svg>
  ),
  salesHistory: (
    <Svg>
      <path d={receipt} />
      <path d="M18 14h12M18 20h12M18 26h7" />
    </Svg>
  ),
  heldReceipts: (
    <Svg>
      <path d="M9 6h20v34l-3.3-2.2-3.4 2.2-3.3-2.2-3.4 2.2-3.3-2.2L9 40z" />
      <path d="M14 13h10M14 19h10" />
      <circle cx="34" cy="32" r="9" fill="var(--icon-bg, #fff)" />
      <path d="M31.5 28.5v7M36.5 28.5v7" />
    </Svg>
  ),
  endOfDay: (
    <Svg>
      <path d="M33 29A13 13 0 0 1 19 12a13 13 0 1 0 14 17z" />
      <path d="M6 41h36" />
      <path d="M36 9v4M34 11h4" />
    </Svg>
  ),
  workOrders: (
    <Svg>
      <rect x="8" y="9" width="24" height="33" rx="3" />
      <rect x="14" y="5" width="12" height="7" rx="2" />
      <path d="M14 20h12M14 26h7" />
      <path d="M41.5 23.5a6 6 0 0 1-7.6 7.6L27 38l-3-3 6.9-6.9a6 6 0 0 1 7.6-7.6l-3.5 3.5.6 2.4 2.4.6z" fill="var(--icon-bg, #fff)" />
    </Svg>
  ),
  purchaseOrders: (
    <Svg>
      <rect x="11" y="9" width="26" height="33" rx="3" />
      <rect x="18" y="5" width="12" height="7" rx="2" />
      <path d="M17 21h14M17 27h14M17 33h8" />
    </Svg>
  ),
  receivingHistory: (
    <Svg>
      <path d="M4 13h25v19H4z" />
      <path d="M29 19h8l6 6.5V32H29z" />
      <circle cx="12" cy="35" r="4" fill="var(--icon-bg, #fff)" />
      <circle cx="35" cy="35" r="4" fill="var(--icon-bg, #fff)" />
      <path d="M16.5 18v8M13 22.5l3.5 3.5 3.5-3.5" />
    </Svg>
  ),
  itemList: (
    <Svg>
      <path d="M7 7h16l18 18-16 16L7 23z" />
      <circle cx="15.5" cy="15.5" r="3" />
    </Svg>
  ),
  poList: (
    <Svg>
      <circle cx="10" cy="13" r="2.2" />
      <circle cx="10" cy="24" r="2.2" />
      <circle cx="10" cy="35" r="2.2" />
      <path d="M18 13h22M18 24h22M18 35h22" />
    </Svg>
  ),
  vendorList: (
    <Svg>
      <path d="M6 19l3.5-11h29L42 19" />
      <path d="M6 19c0 3 2.4 5 5 5s5-2 5-5c0 3 2.4 5 5 5h6c2.6 0 5-2 5-5 0 3 2.4 5 5 5s5-2 5-5" />
      <path d="M9 24v17h30V24" />
      <path d="M20 41V31h8v10" />
    </Svg>
  ),
  departmentList: (
    <Svg>
      <rect x="7" y="7" width="14" height="14" rx="2.5" />
      <rect x="27" y="7" width="14" height="14" rx="2.5" />
      <rect x="7" y="27" width="14" height="14" rx="2.5" />
      <rect x="27" y="27" width="14" height="14" rx="2.5" />
    </Svg>
  ),
  sync: (
    <Svg>
      <path d="M38.5 19A15.5 15.5 0 0 0 10.5 16" />
      <path d="M10 8v8.5h8.5" />
      <path d="M9.5 29a15.5 15.5 0 0 0 28 3" />
      <path d="M38 40v-8.5h-8.5" />
    </Svg>
  ),
  reports: (
    <Svg>
      <path d="M7 41h34" />
      <rect x="10" y="25" width="7" height="12" rx="1" />
      <rect x="20.5" y="14" width="7" height="23" rx="1" />
      <rect x="31" y="20" width="7" height="17" rx="1" />
    </Svg>
  ),
  updates: (
    <Svg>
      <circle cx="24" cy="24" r="17" />
      <path d="M24 14v17M16.5 23.5L24 31l7.5-7.5" />
    </Svg>
  ),
  home: (
    <Svg>
      <path d="M6 22L24 7l18 15" />
      <path d="M11 18v22h26V18" />
      <path d="M20 40V28h8v12" />
    </Svg>
  ),
  settings: (
    <Svg>
      <circle cx="24" cy="24" r="6" />
      <path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.6 10.6l4.2 4.2M33.2 33.2l4.2 4.2M10.6 37.4l4.2-4.2M33.2 14.8l4.2-4.2" />
      <circle cx="24" cy="24" r="13" />
    </Svg>
  )
}

export type IconName = keyof typeof Icons
