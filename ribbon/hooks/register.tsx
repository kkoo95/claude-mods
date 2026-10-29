import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Armed, CacheFacts, Fold, Meter } from '../types'
import type { SessionUsage } from 'claude-code'
import {
  BG, EMPTY, HUE, INK, MUTED, ROBO_SIZE, TEXT, TTL_MIN, TTL_MS, WORD, YELLOW,
  bandPx, cardSvg, chipSvg, costOf, familyOf, fmtIdle, kindOf, mineModel, roboSvg, tok, usd,
} from './cache-art'
import type { CacheView } from './cache-art'

// A band above the prompt in a warm dark look: card surface, cream text,
// five-round gauges that run green to red. Shows how full the context window is
// (CTX; a bold HIGH from 80%), how much of the 7-day rate limit is used (7D),
// what the session has cost so far (yellow), and icon buttons for /clear,
// /compact and reloading the loaded project after a clear.
//
// After the first reply it also shows the prompt cache: WARM (red, Robo bobbing)
// for an hour after the last request, then COLD (blue, Robo frozen) with what the
// next message costs to re-cache. Hide / Show folds the card; warm starts folded,
// cold starts open, and a choice holds until the cache flips. Zero token cost:
// it reads the engine's own figures and draws.

const CELLS = 5
const HIGH_AT = 80
/** The fill at which a gauge turns fully red. */
const RED_AT = 95
/** The app's code font advance, which turns a drawing's pixels into cells. */
const CELL_PX = 12
/** What an icon button takes once the app pads it, and what the width estimate keeps spare. */
const BUTTON_CELLS = 3
const SLACK_CELLS = 2
/** How often the band redraws, so the countdown and the warm-to-cold flip stay current. */
const TICK_MS = 30_000
/** How long Clear and Reload stay armed waiting for their confirming press. */
const ARM_MS = 5_000

const EMPTY_METER: Meter = { percent: null, tokens: 0, window: 0, usd: null, week: null }
const meter = atom({ plugin: 'ribbon', key: 'meter' } as const, EMPTY_METER)
const cache = atom({ plugin: 'ribbon', key: 'cache' } as const, null as CacheFacts | null)
const fold = atom({ plugin: 'ribbon', key: 'fold' } as const, null as Fold | null)
const armed = atom({ plugin: 'ribbon', key: 'armed' } as const, null as Armed)
const project = atom({ plugin: 'ribbon', key: 'project' } as const, null as string | null)

const PROJECT_SKILL = /^(project-memory:)?(load|resume|create)-project$/
/** The project a load, resume or create names, or null for any other command or a bare discovery run. */
const projectOf = (name: string, args: string | undefined): string | null =>
  PROJECT_SKILL.test(name) ? (args ?? '').trim().split(/\s+/)[0] || null : null

const meterOf = (u: Pick<SessionUsage, 'context' | 'cost' | 'rateLimits'>): Meter => ({
  percent: typeof u.context.percent === 'number' ? u.context.percent : null,
  tokens: u.context.tokens ?? 0,
  window: u.context.window,
  usd: u.cost ? u.cost.usd : null,
  week: u.rateLimits.find(r => r.kind === 'seven_day')?.percentUsed ?? null,
})

/** Five rounds filled by half steps: ● full, ◐ half, ○ still to come. */
export const dots = (pct: number): { on: string; off: string } => {
  const halves = Math.max(0, Math.min(CELLS * 2, Math.round((pct / 100) * CELLS * 2)))
  const full = Math.floor(halves / 2)
  const half = halves % 2
  return { on: '●'.repeat(full) + '◐'.repeat(half), off: '○'.repeat(CELLS - full - half) }
}

/** Green at 0%, then yellow and orange, red from RED_AT. */
export const heat = (pct: number): string => {
  const hue = 120 * (1 - Math.max(0, Math.min(pct, RED_AT)) / RED_AT)
  const sat = 0.85
  const light = 0.55
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12
    const v = light - sat * Math.min(light, 1 - light) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(v * 255).toString(16).padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

/** What the cache drawings read, or null until a request and its context size are known. */
export const viewOf = (c: CacheFacts | null, now: number): CacheView | null => {
  if (!c || c.lastAt <= 0 || c.tokens <= 0) return null
  const idleMs = Math.max(0, now - c.lastAt)
  return {
    mode: idleMs >= TTL_MS ? 'cold' : 'warm',
    idle: fmtIdle(idleMs),
    idleMin: Math.floor(idleMs / 60000),
    tokens: c.tokens,
    window: c.window,
    mine: familyOf(c.model),
  }
}

const pull = async ($: EngineInterface): Promise<void> => {
  const u = await $.session.usage()
  await update($, meter, () => meterOf(u))
}

/** Fresh context figures from the engine onto the cache facts, when it has them. */
const measure = async ($: EngineInterface, lastAt: number | null, model: string | null): Promise<void> => {
  const u = await $.session.usage()
  const m = model ?? (await $.session.model())
  await update($, cache, c => ({
    lastAt: lastAt ?? c?.lastAt ?? 0,
    tokens: u.context.tokens && u.context.tokens > 0 ? u.context.tokens : (c?.tokens ?? 0),
    window: u.context.window || c?.window || 0,
    model: m || c?.model || null,
  }))
}

/** Drops what the band knew of the cache, for a conversation that starts over. */
const forget = async ($: EngineInterface): Promise<void> => {
  await update($, cache, () => null)
  await update($, fold, () => null)
  await update($, armed, () => null)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await pull($)
    $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context') || e.changed.includes('cost') || e.changed.includes('rateLimits')) {
      await update($, meter, () => meterOf(e))
    }
    if (e.changed.includes('context') && e.context.tokens && e.context.tokens > 0) {
      const tokens = e.context.tokens
      await update($, cache, c => (c ? { ...c, tokens, window: e.context.window || c.window } : c))
    }
    return next(e)
  })

  // A /clear ends the conversation without a session.start for the fresh one.
  on('session.end', async ($, e, next) => {
    const r = await next(e)
    if (e.reason === 'clear') await forget($)
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && !('skip' in r)) await forget($)
    return r
  })

  // A resumed or forked session knows how long it was away and how big it is.
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    if ((e.source === 'resume' || e.source === 'fork') && typeof e.seconds_since_last_response === 'number') {
      const now = await $.clock.now()
      const lastAt = now - e.seconds_since_last_response * 1000
      const window = (await $.session.usage()).context.window
      const model = typeof e.model === 'string' ? e.model : await $.session.model()
      const tokens = typeof e.context_tokens === 'number' ? e.context_tokens : 0
      await update($, cache, () => ({ lastAt, tokens, window, model }))
    }
    return r
  }).catch(($, e, next) => next(e)) // a band that fails to seed never holds up the session

  on('command.run', async ($, e, next) => {
    const p = projectOf(e.command, e.args)
    if (p) await update($, project, () => p)
    return next(e)
  })

  // Unmatched and read loosely: a { tool: 'Skill' } matcher over this session's MCP tool union is too deep for tsc.
  on('tool.call', async ($, e, next) => {
    const call = e as unknown as { tool: string; skill?: string; args?: string }
    const p = call.tool === 'Skill' && call.skill ? projectOf(call.skill, call.args) : null
    if (p) await update($, project, () => p)
    return next(e)
  })

  // Each main-thread request reads or writes the cache, so its start resets the hour.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      const now = await $.clock.now()
      await update($, cache, c => ({ lastAt: now, tokens: c?.tokens ?? 0, window: c?.window ?? 0, model: c?.model ?? null }))
    }
    yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    const now = await $.clock.now()
    const c = await read($, cache)
    // turn.step stamps the exact request time; when no step of this turn did, the turn's end is the floor.
    const lastAt = !c || now - c.lastAt > e.durationMs ? now : c.lastAt
    await measure($, lastAt, e.usage?.model ?? null)
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // Svg draws on desktop, mobile and VS Code; the terminal gets the text form.
    // Ask the surface, not the table: the terminal's table still lists Svg.
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : null
    const m = await read($, meter)
    const now = await $.clock.now()
    const view = viewOf(await read($, cache), now)

    if (m.percent === null && m.week === null && m.usd === null && !view) {
      return (
        <Box backgroundColor={BG} paddingX={1}>
          <Text color={MUTED}>waiting for the first reply</Text>
        </Box>
      )
    }

    const columns = e.props.bodyColumns ?? e.viewport?.columns ?? 100
    const fill = m.window > 0 ? `${tok(m.tokens)}/${tok(m.window)}` : ''
    const loaded = await read($, project)
    const mode = view ? view.mode : 'warm'
    const stored = await read($, fold)
    // Folding needs the card, and the card is a drawing: the terminal stays folded.
    const open = view !== null && Svg !== null && (stored && stored.mode === mode ? stored.open : mode === 'cold')
    const chip = chipSvg(mode)
    const mine = view ? mineModel(view) : null

    let kind = kindOf(columns)
    let tail = fill
    let left = true
    let robo = Svg !== null
    const summaryText = () => {
      if (!view) return ''
      if (mode === 'warm') return ` ${Math.max(0, TTL_MIN - view.idleMin)}m${left ? ' left' : ''}`
      return ` ${view.idle}${mine ? ` · ${usd(costOf(mine, mode, view.tokens))}` : ''}`
    }
    // The wide row in cells: about one per character, a drawing's pixels over CELL_PX, and the margins between blocks.
    const widthOf = () => {
      const pct = (p: number) => ` ${Math.round(p)}%`.length
      let w = 2 + SLACK_CELLS
      if (m.percent !== null) w += 4 + CELLS + pct(m.percent) + (m.percent >= HIGH_AT ? 5 : 0) + (tail ? 3 + tail.length : 0) + 3
      if (m.week !== null) w += 3 + CELLS + pct(m.week) + 3
      if (m.usd !== null) w += usd(m.usd).length + 3
      if (e.surface !== 'terminal') w += (loaded ? 3 : 2) * (BUTTON_CELLS + 1) + 3
      if (view && !open) {
        w += Svg ? (robo ? ROBO_SIZE / CELL_PX + 1 : 0) + chip.w / CELL_PX : WORD[mode].length + 2
        w += summaryText().length + 2
      }
      if (view && Svg) w += 6
      return w
    }
    // Too wide a row drops "left", then the mascot, then the token count, and stacks only past that.
    if (kind === 'wide' && widthOf() > columns) left = false
    if (kind === 'wide' && widthOf() > columns) robo = false
    if (kind === 'wide' && widthOf() > columns) tail = ''
    if (kind === 'wide' && widthOf() > columns) {
      kind = 'stacked'
      tail = fill
      left = true
      robo = Svg !== null
    }
    const isWide = kind === 'wide'

    // Wide: each gauge and the cost on one row. Narrow: each is a block of lines so nothing wraps or clips.
    const gauge = (key: string, label: string, pct: number, tail: string) => {
      const d = dots(pct)
      const color = heat(pct)
      const shown = Math.round(pct)
      const head = [
        <Text key="n" color={MUTED} bold>{label} </Text>,
        <Text key="on" color={color}>{d.on}</Text>,
        <Text key="off" color={EMPTY}>{d.off}</Text>,
      ]
      const high = key === 'ctx' && pct >= HIGH_AT ? <Text key="high" color={TEXT} bold> HIGH</Text> : null
      return isWide ? (
        <Box key={key} flexDirection="row" flexShrink={0} marginRight={3}>
          {head}
          <Text color={color} bold> {shown}%</Text>
          {high}
          {tail ? <Text color={MUTED}> · {tail}</Text> : null}
        </Box>
      ) : (
        <Box key={key} flexDirection="column" flexShrink={0} marginRight={3}>
          <Box flexDirection="row">{head}</Box>
          <Box flexDirection="row">
            <Text color={color} bold>{shown}%</Text>
            {high}
          </Box>
          {tail ? <Text color={MUTED}>{tail}</Text> : null}
        </Box>
      )
    }
    const ctx = m.percent === null ? null : gauge('ctx', 'CTX', m.percent, tail)
    const week = m.week === null ? null : gauge('week', '7D', m.week, '')
    const cost = m.usd === null ? null : (
      <Box key="cost" flexDirection={isWide ? 'row' : 'column'} flexShrink={0} marginRight={3}>
        <Text color={YELLOW} bold>{usd(m.usd)}</Text>
      </Box>
    )

    // Clear and Reload wipe the conversation: one press arms, a second within ARM_MS runs it.
    const confirm = (which: Exclude<Armed, null>, run: () => Promise<unknown>) => async () => {
      if ((await read($, armed)) === which) {
        await update($, armed, () => null)
        await run()
        return
      }
      await update($, armed, () => which)
      $.clock.after(ARM_MS, () => void update($, armed, a => (a === which ? null : a)))
    }
    const armedNow = await read($, armed)
    const reload = async () => {
      await $.command.run({ command: 'clear' })
      await $.command.run({ command: 'project-memory:resume-project', args: loaded ?? '' })
    }
    // The terminal types the commands itself.
    const actions = e.surface === 'terminal' ? null : (
      <Box key="actions" flexDirection="row" flexShrink={0} marginRight={3} alignItems="flex-start">
        <Button key="ctx-clear" plain dimColor={armedNow !== 'clear'} label={armedNow === 'clear' ? '✓' : '⌫'}
          onPress={confirm('clear', () => $.command.run({ command: 'clear' }))} />
        <Text> </Text>
        <Button key="ctx-compact" plain dimColor label="⇊" onPress={() => void $.command.run({ command: 'compact' })} />
        {loaded ? <Text> </Text> : null}
        {loaded ? (
          <Button key="ctx-reload" plain dimColor={armedNow !== 'reload'} label={armedNow === 'reload' ? '✓' : '↻'}
            onPress={confirm('reload', reload)} />
        ) : null}
      </Box>
    )
    const usage = ctx || week || cost
      ? [ctx, week, cost, actions]
      : [<Box key="wait" flexShrink={0} marginRight={3}><Text color={MUTED}>waiting for the first reply</Text></Box>]

    // Before the first reply there is no cache to show: today's band, as it was.
    if (!view) {
      return (
        <Box flexDirection="row" backgroundColor={BG} paddingX={1}>
          {usage}
        </Box>
      )
    }

    const cold = mode === 'cold'
    const hue = HUE[mode]
    const toggle = () =>
      update($, fold, f => ({ mode, open: !(f && f.mode === mode ? f.open : mode === 'cold') }))

    const badge = Svg
      ? [
          robo ? <Svg key="robo" source={roboSvg(mode)} alt={cold ? 'Robo, frozen' : 'Robo, bobbing'} width={ROBO_SIZE} height={ROBO_SIZE} isInteractive /> : null,
          robo ? <Text key="gap"> </Text> : null,
          <Svg key="chip" source={chip.source} alt={WORD[mode]} width={chip.w} height={chip.h} />,
        ]
      : [<Text key="chip" backgroundColor={hue} color={INK} bold>{` ${WORD[mode]} `}</Text>]

    const summary = cold
      ? [
          <Text key="idle" color={hue} bold>{` ${view.idle}`}</Text>,
          mine ? <Text key="dot" color={MUTED}> · </Text> : null,
          mine ? <Text key="cost" color={TEXT} bold>{usd(costOf(mine, mode, view.tokens))}</Text> : null,
        ]
      : [<Text key="left" color={hue} bold>{summaryText()}</Text>]

    const button = Svg ? (
      <Box key="fold" flexShrink={0} alignItems="flex-start">
        <Button key="cache-fold" label={open ? 'Hide' : 'Show'} onPress={toggle} />
      </Box>
    ) : null
    const grow = <Box key="grow" flexGrow={1} />

    let rows
    if (kind === 'wide') {
      rows = (
        <Box key="row" flexDirection="row" paddingX={1} alignItems="center">
          {usage}
          {open ? null : (
            <Box key="inline" flexDirection="row" flexShrink={0} marginRight={2} alignItems="center">
              {badge}
              {summary}
            </Box>
          )}
          {grow}
          {button}
        </Box>
      )
    } else if (kind === 'stacked') {
      // The cache becomes a third stacked block, the same shape as CTX and the cost.
      rows = (
        <Box key="row" flexDirection="row" paddingX={1}>
          {usage}
          {open ? null : (
            <Box key="block" flexDirection="column" flexShrink={0} marginRight={2}>
              <Box flexDirection="row" alignItems="center">{badge}</Box>
              <Text color={hue} bold>{cold ? `${view.idle} idle` : `${Math.max(0, TTL_MIN - view.idleMin)}m left`}</Text>
              {mine ? (
                <Box flexDirection="row">
                  <Text color={TEXT} bold>{usd(costOf(mine, mode, view.tokens))}</Text>
                  <Text color={MUTED}> next</Text>
                </Box>
              ) : null}
            </Box>
          )}
          {grow}
          {button}
        </Box>
      )
    } else {
      // Narrow: the cache gets its own row under the usage blocks.
      rows = [
        <Box key="row" flexDirection="row" paddingX={1}>
          {usage}
        </Box>,
        <Box key="cache" flexDirection="row" paddingX={1} alignItems="center">
          {badge}
          {summary}
          {grow}
          {button}
        </Box>,
      ]
    }

    let card = null
    if (open && Svg) {
      const c = cardSvg(view, kind, bandPx(columns))
      card = (
        <Box key="card" flexDirection="row">
          <Svg source={c.source} alt={c.alt} width={c.w} height={c.h} isInteractive={kind !== 'tight'} />
        </Box>
      )
    }

    return (
      <Box flexDirection="column" backgroundColor={BG}>
        {rows}
        {card}
      </Box>
    )
  })
}
