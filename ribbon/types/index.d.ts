/**
 * The session's usage: context fill (0 to 100, null before a reading), its tokens and window,
 * the cost so far, and how much of the 7-day rate limit is used (null off a subscription).
 */
export type Meter = { percent: number | null; tokens: number; window: number; usd: number | null; week: number | null }

/**
 * The prompt cache as the band last saw it: when the main thread last sent a
 * request (clock milliseconds), how much context the next request re-sends,
 * the model's context window, and the model.
 */
export type CacheFacts = { lastAt: number; tokens: number; window: number; model: string | null }

/** Whether the cache card is open, remembered only for the state it was set in. */
export type Fold = { mode: 'warm' | 'cold'; open: boolean }

/** Which button waits for its confirming press: Clear, Reload, or none. */
export type Armed = 'clear' | 'reload' | null

declare module 'claude-code' {
  interface PluginState {
    'ribbon': { meter: Meter; cache: CacheFacts | null; fold: Fold | null; armed: Armed; project: string | null }
  }
}
