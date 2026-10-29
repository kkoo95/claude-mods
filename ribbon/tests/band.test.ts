import { expect, mock, test } from 'claude-code/testing'

const USAGE = {
  startedAt: 0,
  context: { window: 1000000, tokens: 245000, percent: 24 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 58 }],
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

test('the band shows the context fill and the session cost, and no rate-limit window', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.parse('2098-12-31T22:00:00Z') })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'ribbon', surface, component: 'AbovePrompt', props: PROPS })
    expect(await band.find({ text: ' 24%' })).toBeDefined()
    expect(await band.find({ text: ' · 245k/1M' })).toBeDefined()
    expect(await band.find({ text: '$3.40' })).toBeDefined()
    const all = JSON.stringify(await band.find({ type: 'Box' }))
    expect(all.indexOf('CTX')).toBeLessThan(all.indexOf('$3.40'))
    expect(all.includes('USAGE')).toBe(false)
    expect(all.includes('COST')).toBe(false)
    expect(all.includes('5H')).toBe(false)
    await band.unmount()
  }
})

test('a context past 80% adds HIGH', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.parse('2098-12-31T22:00:00Z') })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { ...USAGE, context: { window: 200000, tokens: 170000, percent: 85 } } }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const band = await $.ui.mount({ plugin: 'ribbon', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  expect(await band.find({ text: ' HIGH' })).toBeDefined()
  await band.unmount()
})

test('in a narrow band the context and the cost stack on their own lines', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.parse('2098-12-31T22:00:00Z') })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const band = await $.ui.mount({ plugin: 'ribbon', surface: 'desktop', component: 'AbovePrompt', props: { ...PROPS, bodyColumns: 36 } })
  expect(await band.find({ text: '24%' })).toBeDefined()
  expect(await band.find({ text: '245k/1M' })).toBeDefined()
  expect(await band.find({ text: '$3.40' })).toBeDefined()
  await band.unmount()
})

test('a measurement moves the context and the cost', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.parse('2098-12-31T22:00:00Z') })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.session.measure({
    context: { window: 1000000, tokens: 410000, percent: 41 },
    rateLimits: [],
    cost: { usd: 5.12 },
    changed: ['context', 'cost'],
  })

  const band = await $.ui.mount({ plugin: 'ribbon', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  expect(await band.find({ text: ' 41%' })).toBeDefined()
  expect(await band.find({ text: '$5.12' })).toBeDefined()
  await band.unmount()
})

const START = Date.parse('2098-12-31T22:00:00Z')

const setup = async ($: any, on: any) => {
  mock.store(on)
  const clock = mock.clock(on, { now: START })
  const ran: string[] = []
  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE }))
  on('command.run', ($: any, e: any) => (ran.push(`${e.command} ${e.args}`.trim()), {}))
  on('tool.call', () => ({ result: '' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const band = await $.ui.mount({ plugin: 'ribbon', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  const label = async (key: string) => (await band.find({ key }))?.props.label
  return { clock, ran, band, label }
}

test('clear runs /clear only on a second press, and a lone press disarms after 5s', async ($, on) => {
  const { clock, ran, band, label } = await setup($, on)

  expect(await label('ctx-clear')).toBe('⌫')
  await band.press({ key: 'ctx-clear' })
  expect(await label('ctx-clear')).toBe('✓')
  expect(ran).toEqual([])

  await clock.advance(5_000)
  expect(await label('ctx-clear')).toBe('⌫')

  await band.press({ key: 'ctx-clear' })
  await band.press({ key: 'ctx-clear' })
  expect(ran).toEqual(['clear'])
  expect(await label('ctx-clear')).toBe('⌫')
  await band.unmount()
})

test('compact runs /compact on one press', async ($, on) => {
  const { ran, band } = await setup($, on)
  await band.press({ key: 'ctx-compact' })
  expect(ran).toEqual(['compact'])
  await band.unmount()
})

test('reload shows only once a project is loaded, then clears and resumes it on a confirmed press', async ($, on) => {
  const { ran, band } = await setup($, on)
  expect(await band.find({ key: 'ctx-reload' })).toBeUndefined()

  await ($ as unknown as { tool: { call: (call: object) => Promise<unknown> } }).tool.call({ tool: 'Skill', skill: 'project-memory:load-project', args: 'fixq audit queues' })
  expect(await band.find({ key: 'ctx-reload' })).toBeDefined()

  await band.press({ key: 'ctx-reload' })
  expect(ran).toEqual([])
  await band.press({ key: 'ctx-reload' })
  expect(ran).toEqual(['clear', 'project-memory:resume-project fixq'])
  await band.unmount()
})

test('a typed /resume-project names the project too, a bare discovery run does not', async ($, on) => {
  const { band } = await setup($, on)
  await $.command.run({ command: 'project-memory:load-project', args: '' } as never)
  expect(await band.find({ key: 'ctx-reload' })).toBeUndefined()
  await $.command.run({ command: 'resume-project', args: 'listview' } as never)
  expect(await band.find({ key: 'ctx-reload' })).toBeDefined()
  await band.unmount()
})

test('the terminal draws no buttons', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: START })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const band = await $.ui.mount({ plugin: 'ribbon', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect(await band.find({ key: 'ctx-clear' })).toBeUndefined()
  expect(await band.find({ key: 'ctx-compact' })).toBeUndefined()
  await band.unmount()
})
