import type { DailyStats } from '../../api/tauri'

interface Props {
  dailyStats: DailyStats[]
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

export default function WritingCalendar({ dailyStats }: Props) {
  if (dailyStats.length === 0) return null

  const dateMap = new Map<string, DailyStats>()
  for (const d of dailyStats) {
    dateMap.set(d.date, d)
  }

  const firstDate = new Date(dailyStats[0]!.date)
  const lastDate = new Date(dailyStats[dailyStats.length - 1]!.date)

  const allDays: { date: string; dayNum: number; weekday: number; stats: DailyStats | null }[] = []
  const cursor = new Date(firstDate)
  while (cursor <= lastDate) {
    const dateStr = cursor.toISOString().slice(0, 10)
    allDays.push({
      date: dateStr,
      dayNum: cursor.getDate(),
      weekday: (cursor.getDay() + 6) % 7,
      stats: dateMap.get(dateStr) ?? null,
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  // Pad to start on Monday
  const firstWeekday = allDays[0]!.weekday
  for (let i = 0; i < firstWeekday; i++) {
    allDays.unshift({ date: '', dayNum: 0, weekday: i, stats: null })
  }

  return (
    <div className="month-calendar">
      {WEEKDAYS.map((w) => (
        <div key={w} className="month-calendar-header">{w}</div>
      ))}
      {allDays.map((day, i) => {
        const st = day.stats
        const hasData = st && (st.word_count > 0 || st.ai_generations > 0)
        const cls = [
          'month-calendar-day',
          day.dayNum === 0 ? 'pad' : '',
          hasData ? 'has-data' : '',
        ].filter(Boolean).join(' ')

        return (
          <div
            key={i}
            className={cls}
            title={st
              ? `${st.date}\n字数: ${st.word_count.toLocaleString()}\nAI: ${st.ai_generations} 次`
              : day.date || ''}
          >
            {day.dayNum > 0 && (
              <span className="month-calendar-day-num">{day.dayNum}</span>
            )}
            {st && st.word_count > 0 && (
              <span className="month-calendar-day-words">字数: {st.word_count.toLocaleString()}</span>
            )}
            {st && st.ai_generations > 0 && (
              <span className="month-calendar-day-ai">AI: {st.ai_generations}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
