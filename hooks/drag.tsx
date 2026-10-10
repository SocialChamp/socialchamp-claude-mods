import type { ClientModule } from 'claude-code'

/** What the pane hands the week grid: its seven days and the posts that can move, already labelled. */
export type DragProps = {
  days: Array<{ day: string; label: string; isToday: boolean }>
  posts: Array<{ id: string; day: string; label: string; color: string }>
}

type DragState = { drag: { id: string; fromDay: string } | null; over: number | null }

/** The latest props and region width, for the pointer listener, which is set once on the first draw. */
let latest: DragProps = { days: [], posts: [] }
let latestColumns = 0

/**
 * A week of movable posts in seven columns: press a post, drag it onto another day, let go. The drop goes to the
 * pane as `{ postId, toDay }`; the pane checks it and asks Yes / Cancel before anything changes.
 */
const WeekDrag: ClientModule<DragProps, DragState> = (props, surface) => {
  latest = props
  latestColumns = surface.columns
  const { Box, Text } = surface.elements
  const width = Math.max(7, Math.floor(surface.columns / 7))
  // Read at the event, not at the first draw: the region is laid out after it.
  const columnOf = (x: number) => Math.min(6, Math.max(0, Math.floor(x / Math.max(7, Math.floor(latestColumns / 7)))))
  const postsOf = (day: string) => latest.posts.filter(p => p.day === day)

  if (surface.state === undefined) {
    surface.onPointer(event => {
      const state = surface.state ?? { drag: null, over: null }
      if (event.type === 'down' && event.button === 'left') {
        const day = latest.days[columnOf(event.x)]?.day
        const post = day === undefined ? undefined : postsOf(day)[event.y - 1]
        surface.setState({ drag: post !== undefined && day !== undefined ? { id: post.id, fromDay: day } : null, over: null })
      } else if (event.type === 'move' && state.drag !== null) {
        const over = columnOf(event.x)
        if (over !== state.over) surface.setState({ ...state, over })
      } else if (event.type === 'up' && state.drag !== null) {
        const toDay = latest.days[columnOf(event.x)]?.day
        if (toDay !== undefined && toDay !== state.drag.fromDay) surface.post({ postId: state.drag.id, toDay })
        surface.setState({ drag: null, over: null })
      } else if (event.type === 'leave' && state.drag !== null) {
        surface.setState({ drag: null, over: null })
      }
    })
    surface.setState({ drag: null, over: null })
  }

  const state = surface.state ?? { drag: null, over: null }
  return (
    <Box flexDirection="row">
      {props.days.map((d, i) => {
        const isTarget = state.drag !== null && state.over === i && d.day !== state.drag.fromDay
        return (
          <Box key={`col-${d.day}`} width={width} flexDirection="column">
            <Text bold={d.isToday || isTarget} color={isTarget ? 'suggestion' : d.isToday ? '#F7752A' : undefined} wrap="truncate-end">
              {isTarget ? `▼ ${d.label}` : d.label}
            </Text>
            {postsOf(d.day).map(p => (
              <Text key={`chip-${p.id}`} color={p.color} dimColor={state.drag?.id === p.id} wrap="truncate-end">
                {state.drag?.id === p.id ? `✋ ${p.label}` : p.label}
              </Text>
            ))}
          </Box>
        )
      })}
    </Box>
  )
}

export default WeekDrag
