import type { PosBridge } from '../../shared/types'

declare global {
  interface Window {
    /** Provided by src/preload/index.ts */
    pos: PosBridge
  }
}

export {}
