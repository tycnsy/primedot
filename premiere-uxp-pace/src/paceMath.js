/**
 * Minimal pace math — mirrors src/lib/calc.ts for the Premiere panel.
 * Keep in sync when task_length / progress / pace formulas change.
 */

function safeNum(v, fallback = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function getSubtasks(parentId, allTasks) {
  return allTasks
    .filter((t) => t.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function complexParentEffectiveModifier(parent, allTasks) {
  const subs = getSubtasks(parent.id, allTasks);
  if (subs.length === 0) return safeNum(parent.scaling_modifier);
  return subs.reduce((acc, s) => acc + safeNum(s.scaling_modifier), 0);
}

function subtasksHaveProgressMismatch(parent, allTasks) {
  const subs = getSubtasks(parent.id, allTasks);
  if (subs.length < 2) return false;
  const first = subs[0].current_progress;
  return subs.some((s) => s.current_progress !== first);
}

function complexParentEffectiveProgress(parent, allTasks) {
  const subs = getSubtasks(parent.id, allTasks);
  if (subs.length === 0) return safeNum(parent.current_progress);
  if (subtasksHaveProgressMismatch(parent, allTasks)) {
    return safeNum(parent.current_progress);
  }
  return subs[0].current_progress;
}

export function taskLength(task, project, allTasks) {
  const buffer = safeNum(project.buffer_modifier, 1);

  if (task.complex_mode === 'expanded') return 0;
  if (task.complex_mode === 'compressed' && task.id && allTasks) {
    const modifier = complexParentEffectiveModifier(task, allTasks);
    return safeNum(project.video_length) * modifier * buffer;
  }

  switch (task.type) {
    case 'scaling':
      return (
        safeNum(project.video_length) *
        safeNum(task.scaling_modifier) *
        buffer
      );
    case 'scripting':
      return (
        safeNum(task.script_length) *
        safeNum(task.scripting_modifier) *
        buffer
      );
    case 'custom':
      return safeNum(task.unit_count) * safeNum(task.unit_length) * buffer;
    case 'manual':
      return safeNum(task.manual_length) * buffer;
    default:
      return 0;
  }
}

function progressTarget(task, project) {
  switch (task.type) {
    case 'scaling':
      return safeNum(project.video_length);
    case 'scripting':
      return safeNum(task.script_length);
    case 'manual':
      return safeNum(task.manual_length);
    case 'custom':
      return safeNum(task.unit_count);
    default:
      return 0;
  }
}

function taskProgressPercent(task, project, allTasks) {
  const target = progressTarget(task, project);
  let current;
  if (task.complex_mode === 'compressed' && task.id && allTasks) {
    current = complexParentEffectiveProgress(task, allTasks);
  } else {
    current = safeNum(task.current_progress);
  }
  if (target <= 0) return current <= 0 ? 0 : 100;
  return (current / target) * 100;
}

function deriveTaskStatus(task, project, allTasks) {
  const percent = taskProgressPercent(task, project, allTasks);
  if (percent <= 0) return 'not_started';
  if (percent >= 100) return 'complete';
  return 'in_progress';
}

export function calculatedProgress(task, project, allTasks) {
  if (task.complex_mode === 'expanded') return 0;
  if (task.complex_mode === 'compressed' && task.id && allTasks) {
    if (deriveTaskStatus(task, project, allTasks) === 'complete') {
      return taskLength(task, project, allTasks);
    }
    const buffer = safeNum(project.buffer_modifier, 1);
    const modifier = complexParentEffectiveModifier(task, allTasks);
    const cp = complexParentEffectiveProgress(task, allTasks);
    return cp * modifier * buffer;
  }

  if (deriveTaskStatus(task, project, allTasks) === 'complete') {
    return taskLength(task, project, allTasks);
  }
  const buffer = safeNum(project.buffer_modifier, 1);
  const cp = safeNum(task.current_progress);
  switch (task.type) {
    case 'scaling':
      return cp * safeNum(task.scaling_modifier) * buffer;
    case 'scripting':
      return cp * safeNum(task.scripting_modifier) * buffer;
    case 'custom':
      return cp * safeNum(task.unit_length) * buffer;
    case 'manual':
      return cp * buffer;
    default:
      return 0;
  }
}

function shouldCountInAggregate(task, allTasks) {
  if (task.complex_mode === 'expanded') return false;
  if (task.parent_id) {
    const parent = allTasks.find((t) => t.id === task.parent_id);
    if (parent && parent.complex_mode === 'compressed') return false;
  }
  return true;
}

export function totalTaskLength(tasks, project) {
  return tasks.reduce((acc, t) => {
    if (!shouldCountInAggregate(t, tasks)) return acc;
    return acc + taskLength(t, project, tasks);
  }, 0);
}

export function projectProgress(tasks, project) {
  return tasks.reduce((acc, t) => {
    if (!shouldCountInAggregate(t, tasks)) return acc;
    return acc + calculatedProgress(t, project, tasks);
  }, 0);
}

export function remainingProgress(tasks, project) {
  return Math.max(0, totalTaskLength(tasks, project) - projectProgress(tasks, project));
}

export function estimatedCompletion(tasks, project, now = new Date()) {
  const seconds = remainingProgress(tasks, project);
  return new Date(now.getTime() + seconds * 1000);
}

export function currentPace(tasks, project, pace, now = new Date()) {
  const target = new Date(pace.target_deadline).getTime();
  const completion = estimatedCompletion(tasks, project, now).getTime();
  return Math.round((target - completion) / 1000);
}

export function paceMargin(pace) {
  return Math.round(
    (new Date(pace.true_deadline).getTime() -
      new Date(pace.target_deadline).getTime()) /
      1000,
  );
}

export function currentPaceEnd(tasks, project, pace) {
  const target = new Date(pace.target_deadline).getTime();
  return new Date(target - remainingProgress(tasks, project) * 1000);
}

function pad2(n) {
  var s = String(n);
  return s.length >= 2 ? s : '0' + s;
}

export function formatHMS(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return '--:--:--';
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.floor(Math.abs(totalSeconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return sign + pad2(h) + ':' + pad2(m) + ':' + pad2(s);
}

export function paceTone(seconds) {
  if (seconds < 0) return 'behind';
  if (seconds < 3600) return 'tight';
  return 'ahead';
}

export function formatShortDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Matches web Pace cards: "Jul 9, 12:53 AM" */
export function formatPaceEnd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'No pace end';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function isParentItem(item) {
  return item.parent_id == null;
}

export function isChildItem(item) {
  return item.parent_id != null;
}

export function parentIdsWithChildren(items) {
  const ids = new Set();
  for (const item of items) {
    if (item.parent_id != null) ids.add(item.parent_id);
  }
  return ids;
}

/** Same filter as src/lib/projects.ts paceEligibleProjects */
export function paceEligibleProjects(projects) {
  const parentsWithChildren = parentIdsWithChildren(projects);
  return projects.filter(
    (project) =>
      isChildItem(project) ||
      (isParentItem(project) && !parentsWithChildren.has(project.id)),
  );
}

export function sortByDueDate(projects) {
  return projects.slice().sort(function (a, b) {
    var aDue = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
    var bDue = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    var aOrder = a.sort_order == null ? 0 : a.sort_order;
    var bOrder = b.sort_order == null ? 0 : b.sort_order;
    return aOrder - bOrder;
  });
}
