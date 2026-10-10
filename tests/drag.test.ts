import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PANE = { title: 'Social Champ', isFocused: true, bodyColumns: 120, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 100 }, view: {} }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }

// Next week's Monday, so every drop lands ahead of now whatever day the tests run.
const now = new Date()
const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + 7)
const nextWeek = (offset: number, h: number) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset, h, 0)
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const setup = (on: On) => {
  const writes: Array<{ tool: string; args: unknown }> = []
  mock.store(on)
  const clock = mock.clock(on, { now: Date.now() })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('mcp.call', (_$, e) => {
    if (!e.tool.startsWith('get_') && e.tool !== 'approval_list_pending') writes.push({ tool: e.tool, args: e.args })
    const answers: Record<string, unknown> = {
      get_paginated_posts: { posts: [
        { id: 'm1', channelId: 'c1', text: 'Monday reel', dateTime: nextWeek(0, 10).toISOString(), socialType: 'IN_PAGE', sourceType: 'QUEUE' },
        { id: 'done', channelId: 'c1', text: 'Already out', dateTime: nextWeek(1, 9).toISOString(), socialType: 'IN_PAGE', isPosted: true },
      ], pagination: { totalPages: 1 } },
      get_channels: { items: [{ id: 'c1', name: 'Pandas', type: 'IN_PAGE', workspaceId: 'w1' }] },
      get_workspaces: { items: [{ id: 'w1', name: 'Official', profilesCount: 1 }] },
    }
    return { value: { content: [{ type: 'text', text: JSON.stringify(answers[e.tool] ?? {}) }], isError: false } }
  })
  return { writes, clock }
}

test('drag a post from Monday onto Wednesday: it keeps its time and moves after Yes', async ($, on) => {
  const fake = setup(on)
  await $.command.run({ command: 'socialchamp-calendar', args: 'week', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await fake.clock.advance(10)
  await ui.press({ plugin: 'socialchamp-calendar', key: 'drag-on' })
  await ui.resize({ columns: 70, rows: 3, in: 'week-drag' })
  // Seven columns of 10 cells: Monday's first post sits at row 1 of column 0; x 25 is Wednesday.
  expect(await ui.find({ text: /Monday reel/, in: 'week-drag' })).toBeDefined()
  expect(await ui.find({ text: /Already out/, in: 'week-drag' })).toBeUndefined()
  await ui.pointer({ type: 'down', button: 'left', x: 2, y: 1, in: 'week-drag' })
  await ui.pointer({ type: 'move', button: 'left', x: 25, y: 1, in: 'week-drag' })
  await ui.pointer({ type: 'up', button: 'left', x: 25, y: 1, in: 'week-drag' })
  expect(fake.writes).toEqual([])
  expect(await ui.find({ text: /You can undo this here/ })).toBeDefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-toolbar' })
  expect(fake.writes).toEqual([{ tool: 'update_post', args: { postId: 'm1', dateTime: nextWeek(2, 10).toISOString() } }])
})

test('a drop that is not exactly a post and a day of this week is ignored', async ($, on) => {
  const fake = setup(on)
  await $.command.run({ command: 'socialchamp-calendar', args: 'week', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await fake.clock.advance(10)
  await ui.press({ plugin: 'socialchamp-calendar', key: 'drag-on' })
  await ui.post({ postId: 'm1', toDay: ymd(nextWeek(2, 0)), extra: true }, { in: 'week-drag' })
  await ui.post({ postId: 'done', toDay: ymd(nextWeek(3, 0)) }, { in: 'week-drag' })
  await ui.post({ postId: 'm1', toDay: ymd(nextWeek(9, 0)) }, { in: 'week-drag' })
  await ui.post({ postId: 'ghost', toDay: ymd(nextWeek(2, 0)) }, { in: 'week-drag' })
  expect(await ui.find({ key: 'yes-toolbar' })).toBeUndefined()
  expect(fake.writes).toEqual([])
})
