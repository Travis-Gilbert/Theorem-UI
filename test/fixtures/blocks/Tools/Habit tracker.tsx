// uses: files.read("Data/habits.csv"), state("habits")
// A habit tracker: how many days each habit was kept, and a check for today.

const rows = await files.csv("Data/habits.csv")
const today = await state("habits")
const habits = [...new Set(rows.map((row) => String(row.habit)))]

const kept = (habit: string) =>
  rows.filter((row) => row.habit === habit && row.done === 1).length

export default function HabitTracker() {
  const checked = today.use()
  return (
    <ul className="habit-tracker">
      {habits.map((habit) => (
        <li key={habit}>
          <label>
            <input
              type="checkbox"
              checked={Boolean(checked[habit])}
              onChange={(event) => today.set(habit, event.target.checked)}
            />
            {habit}: kept {kept(habit)} days
          </label>
        </li>
      ))}
    </ul>
  )
}
