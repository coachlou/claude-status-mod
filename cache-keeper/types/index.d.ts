export type Cache = {
  /** ms of the last model response; null before the first turn or after /clear */
  warmAt: number | null
  /** cache window in ms */
  ttlMs: number
  /** true once the engine reported the real TTL; config no longer overrides it */
  isDetected: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'cache-keeper': { cache: Cache; now: number; busy: boolean }
  }
}
