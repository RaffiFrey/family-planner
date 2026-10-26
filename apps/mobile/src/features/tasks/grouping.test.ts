import { groupTasks, taskGroup } from './grouping';

const now = new Date(2026, 9, 25, 12, 0);
const at = (d: number, h = 9) => new Date(2026, 9, d, h, 0).toISOString();

describe('taskGroup', () => {
  it('buckets by due date relative to today', () => {
    expect(taskGroup({ dueAt: at(24) }, now)).toBe('overdue');
    expect(taskGroup({ dueAt: at(25, 8) }, now)).toBe('today');
    expect(taskGroup({ dueAt: at(25, 23) }, now)).toBe('today');
    expect(taskGroup({ dueAt: at(26, 0) }, now)).toBe('upcoming');
    expect(taskGroup({ dueAt: null }, now)).toBe('someday');
  });
});

describe('groupTasks', () => {
  it('orders groups and sorts by due date, then priority', () => {
    const groups = groupTasks(
      [
        { id: 'a', title: 'A', priority: 'low' as const, dueAt: at(27) },
        { id: 'b', title: 'B', priority: 'high' as const, dueAt: at(27) },
        { id: 'c', title: 'C', priority: 'normal' as const, dueAt: at(20) },
        { id: 'd', title: 'D', priority: 'normal' as const, dueAt: null },
      ],
      now,
    );
    expect(groups.map((g) => g.group)).toEqual(['overdue', 'upcoming', 'someday']);
    expect(groups[1]?.tasks.map((t) => t.id)).toEqual(['b', 'a']);
  });
});
