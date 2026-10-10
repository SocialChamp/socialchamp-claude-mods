import { expect, test } from 'claude-code/testing'

import { charLimit, hasPassed, relativeTime, isValidPassword, onDay, parseWhen, channelOptions, workspaceOptions, MAX_SELECT_OPTIONS, isPlaceable, addMonths, byDay, filterPosts, loadRange, monthGrid, pickForDay, plural, rangeFor, rangeLabel, rowLabel, slim, weekStart } from '../hooks/data'

test('weeks start on Monday and ranges cover the view', () => {
  expect(weekStart('2026-10-09')).toBe('2026-10-05')
  expect(weekStart('2026-10-05')).toBe('2026-10-05')
  expect(weekStart('2026-10-11')).toBe('2026-10-05')
  expect(rangeFor('week', '2026-10-09')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
  expect(rangeFor('month', '2026-10-09')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  expect(rangeFor('day', '2026-10-09')).toEqual({ from: '2026-10-09', to: '2026-10-09' })
  expect(addMonths('2026-12-15', 1)).toBe('2027-01-01')
})

test('the month grid is whole Monday-first weeks', () => {
  const grid = monthGrid('2026-10-09')
  expect(grid.length).toBe(5)
  expect(grid[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  expect(grid[4]?.[5]).toBe('2026-10-31')
})

test('posts are read as failed, posted, pending or scheduled', () => {
  const base = { id: 'a', channelId: 'c1', text: 'hi', dateTime: '2026-10-09T10:00:00.000Z', socialType: 'IN' }
  expect(slim({ ...base, hasError: true, error: { message: 'Token expired' } })).toMatchObject({ status: 'failed', error: 'Token expired' })
  expect(slim({ ...base, isPosted: true, permalinkUrl: 'https://x.test/1' })).toMatchObject({ status: 'posted', permalink: 'https://x.test/1' })
  expect(slim({ ...base, approvalStatus: 'PENDING' }).status).toBe('pending')
  expect(slim({ ...base, videoUrls: ['v'], imageUrls: ['i', 'j'] })).toMatchObject({ status: 'scheduled', media: 3 })
})

test('filters by workspace or channel, and groups by day in time order', () => {
  const channels = [
    { id: 'c1', name: 'A', type: 'IN', workspaceId: 'w1' },
    { id: 'c2', name: 'B', type: 'YT', workspaceId: 'w2' },
  ]
  const posts = [
    slim({ id: 'p2', channelId: 'c1', text: '', dateTime: '2026-10-09T12:00:00.000Z', socialType: 'IN' }),
    slim({ id: 'p1', channelId: 'c1', text: '', dateTime: '2026-10-09T08:00:00.000Z', socialType: 'IN' }),
    slim({ id: 'p3', channelId: 'c2', text: '', dateTime: '2026-10-09T09:00:00.000Z', socialType: 'YT' }),
  ]
  expect(filterPosts(posts, channels, 'w2', 'all').map(p => p.id)).toEqual(['p3'])
  expect(filterPosts(posts, channels, 'all', 'c1').length).toBe(2)
  const grouped = [...byDay(posts).values()].flat().map(p => p.id)
  expect(grouped).toEqual(['p1', 'p3', 'p2'])
})

test('the issues view loads a week back and a week ahead, and says so', () => {
  expect(loadRange('issues', '2026-10-09')).toEqual({ from: '2026-10-03', to: '2026-10-16' })
  expect(rangeLabel('issues', '2026-10-09')).toBe('Needs attention · Sat 3 Oct – Fri 16 Oct')
})

test('a busy day shows failures, pending and the soonest upcoming before posted ones', () => {
  const mk = (id: string, h: number, extra: Record<string, unknown>) =>
    slim({ id, channelId: 'c', text: '', dateTime: `2026-10-09T${String(h).padStart(2, '0')}:00:00.000Z`, socialType: 'IN', ...extra })
  const posts = [
    mk('posted1', 1, { isPosted: true }), mk('posted2', 2, { isPosted: true }), mk('posted3', 3, { isPosted: true }),
    mk('late-fail', 21, { hasError: true }), mk('pending', 18, { approvalStatus: 'PENDING' }),
    mk('soon', 13, {}), mk('later', 20, {}),
  ]
  expect(pickForDay(posts, 4, '2026-10-09T12:00:00.000Z').map(p => p.id)).toEqual(['soon', 'pending', 'later', 'late-fail'])
  expect(pickForDay(posts, 10, '2026-10-09T12:00:00.000Z').length).toBe(7)
})

test('row labels keep the post text visible beside long channel names', () => {
  const label = rowLabel('Champ Community - All About Social Media and Digital Marketing', 'Big launch today', 40)
  expect(label).toBe('Champ Community -…: Big launch today')
  expect(rowLabel('A', 'x'.repeat(100), 20).length).toBe(20)
  expect(plural(1, 'post')).toBe('1 post')
  expect(plural(2, 'post')).toBe('2 posts')
})

test('posts with no id or no readable time are left out instead of breaking the calendar', () => {
  const ok = { id: 'a', channelId: 'c', text: null, dateTime: '2026-10-09T10:00:00.000Z', socialType: null, labels: 'x' }
  expect(isPlaceable(ok)).toBe(true)
  expect(isPlaceable({ ...ok, dateTime: null })).toBe(false)
  expect(isPlaceable({ ...ok, dateTime: 'soon' })).toBe(false)
  expect(isPlaceable({ ...ok, id: undefined })).toBe(false)
  expect(isPlaceable(null)).toBe(false)
  expect(slim(ok as never)).toMatchObject({ text: '', socialType: '', labels: [], media: 0 })
})

test('dropdowns stay within the 64 entries the desktop app draws', () => {
  const channels = Array.from({ length: 80 }, (_, i) => ({ id: `c${i}`, name: `Channel ${i}`, type: 'IN', workspaceId: i < 70 ? 'big' : 'small' }))
  expect(channelOptions(channels, 'all').length).toBe(1)
  expect(channelOptions(channels, 'small').length).toBe(11)
  expect(channelOptions(channels, 'big').length).toBe(MAX_SELECT_OPTIONS)
  const workspaces = Array.from({ length: 100 }, (_, i) => ({ id: `w${i}`, name: `W${i}` }))
  expect(workspaceOptions(workspaces).length).toBe(MAX_SELECT_OPTIONS)
})

test('typed times read as local time, on the post day or a given date', () => {
  const post = new Date(2026, 9, 10, 15, 30).toISOString()
  expect(parseWhen('09:15', post)).toBe(new Date(2026, 9, 10, 9, 15).toISOString())
  expect(parseWhen('2026-10-12 18:05', post)).toBe(new Date(2026, 9, 12, 18, 5).toISOString())
  expect(parseWhen('25:00', post)).toBeNull()
  expect(parseWhen('tomorrow', post)).toBeNull()
  expect(onDay(post, '2026-10-13')).toBe(new Date(2026, 9, 13, 15, 30).toISOString())
  expect(isValidPassword('')).toBe(true)
  expect(isValidPassword('short')).toBe(false)
  expect(isValidPassword('x'.repeat(21))).toBe(false)
})

test('platform character limits and relative times', () => {
  expect(charLimit('TW')).toBe(280)
  expect(charLimit('IG_BUSINESS')).toBe(2200)
  expect(charLimit('SOMETHING_NEW')).toBeUndefined()
  const now = Date.parse('2026-10-10T12:00:00.000Z')
  expect(relativeTime('2026-10-10T12:20:00.000Z', now)).toBe('in 20 min')
  expect(relativeTime('2026-10-10T09:00:00.000Z', now)).toBe('3 hours ago')
  expect(relativeTime('2026-10-13T12:00:00.000Z', now)).toBe('in 3 days')
})

test('a change whose time has passed while its Yes bar sat open is caught', () => {
  const now = Date.parse('2026-10-10T12:00:00Z')
  const at = (iso: string) => ({ kind: 'reschedule' as const, tool: 'update_post', args: { postId: 'p', dateTime: iso }, summary: '', scope: 'p' })
  expect(hasPassed(at('2026-10-10T11:00:00Z'), now)).toBe(true)
  expect(hasPassed(at('2026-10-10T12:00:30Z'), now)).toBe(true)
  expect(hasPassed(at('2026-10-10T13:00:00Z'), now)).toBe(false)
  const day = { kind: 'shift-day' as const, tool: 'queue_reorder', summary: '', scope: 'd',
    args: { items: [{ postId: 'a', dateTime: '2026-10-11T09:00:00Z' }, { postId: 'b', dateTime: '2026-10-10T08:00:00Z' }] } }
  expect(hasPassed(day, now)).toBe(true)
  expect(hasPassed({ kind: 'pause', tool: 'queue_pause', args: {}, summary: '', scope: 'toolbar' }, now)).toBe(false)
})
