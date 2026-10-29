import { expect, mock, test } from 'claude-code/testing'
import { dots, heat } from '../hooks/register'

const USAGE = {
  startedAt: 0,
  context: { window: 1000000, tokens: 245000, percent: 24 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 58 }, { kind: 'seven_day', percentUsed: 47 }],
  cost: { usd: 3.4 },
}

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 4,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 4 },
  view: {},
} as const

test('the gauges fill five rounds by half steps and leave the rest hollow', async () => {
  expect(dots(0)).toEqual({ on: '', off: '○○○○○' })
  expect(dots(24)).toEqual({ on: '●', off: '○○○○' })
  expect(dots(47)).toEqual({ on: '●●◐', off: '○○' })
  expect(dots(100)).toEqual({ on: '●●●●●', off: '' })
  expect(dots(130)).toEqual({ on: '●●●●●', off: '' })
})

test('the gauge colour runs green, yellow, orange, then red from 95%', async () => {
  const rgb = (pct: number) => {
    const h = heat(pct)
    return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) }
  }
  const green = rgb(0)
  const yellow = rgb(47.5)
  const orange = rgb(71.25)
  const red = rgb(95)
  expect(green.g).toBeGreaterThan(green.r)
  expect(Math.abs(yellow.r - yellow.g)).toBeLessThan(8)
  expect(orange.r).toBeGreaterThan(orange.g)
  expect(orange.g).toBeGreaterThan(orange.b)
  expect(red.g).toBe(red.b)
  expect(heat(100)).toBe(heat(95))
})

test('the 7-day window shows as a 7D gauge after CTX', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.parse('2098-12-31T22:00:00Z') })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const band = await $.ui.mount({ plugin: 'ribbon', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  expect(await band.find({ text: '●●◐' })).toBeDefined()
  expect(await band.find({ text: ' 47%' })).toBeDefined()
  const all = JSON.stringify(await band.find({ type: 'Box' }))
  expect(all.indexOf('CTX')).toBeLessThan(all.indexOf('7D'))
  expect(all.indexOf('7D')).toBeLessThan(all.indexOf('$3.40'))
  await band.unmount()
})

test('a rate-limit measurement moves the 7D gauge, and none hides it', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.parse('2098-12-31T22:00:00Z') })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  let band = await $.ui.mount({ plugin: 'ribbon', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  expect(JSON.stringify(await band.find({ type: 'Box' })).includes('7D')).toBe(false)
  await band.unmount()

  await $.session.measure({
    context: USAGE.context,
    rateLimits: [{ kind: 'seven_day', percentUsed: 91.5 }],
    cost: USAGE.cost,
    changed: ['rateLimits'],
  })
  band = await $.ui.mount({ plugin: 'ribbon', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  expect(await band.find({ text: ' 92%' })).toBeDefined()
  expect(await band.find({ text: '●●●●◐' })).toBeDefined()
  await band.unmount()
})
