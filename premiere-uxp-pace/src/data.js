import {
  currentPace,
  currentPaceEnd,
  estimatedCompletion,
  formatHMS,
  formatPaceEnd,
  formatShortDate,
  paceEligibleProjects,
  paceMargin,
  paceTone,
  remainingProgress,
  sortByDueDate,
  totalTaskLength,
  projectProgress,
} from './paceMath.js';

const REFRESH_MS = 5000;

export function loadPaceSnapshot(client) {
  return client
    .from('projects')
    .select('*', {
      archived_at: 'is.null',
      order: 'sort_order.asc',
    })
    .then(function (projects) {
      var list = Array.isArray(projects) ? projects : [];
      var eligible = sortByDueDate(
        paceEligibleProjects(list).filter(function (p) {
          return !p.pace_hidden;
        }),
      );

      if (eligible.length === 0) {
        return { projects: [], items: [], fetchedAt: new Date() };
      }

      var ids = eligible.map(function (p) {
        return p.id;
      });
      var inFilter = 'in.(' + ids.join(',') + ')';

      return Promise.all([
        client.from('tasks').select('*', {
          project_id: inFilter,
          order: 'sort_order.asc',
        }),
        client.from('pace_settings').select('*', {
          project_id: inFilter,
        }),
      ]).then(function (results) {
        var tasks = results[0];
        var paceRows = results[1];
        var taskList = Array.isArray(tasks) ? tasks : [];
        var paceList = Array.isArray(paceRows) ? paceRows : [];
        var paceByProject = {};
        for (var i = 0; i < paceList.length; i++) {
          paceByProject[paceList[i].project_id] = paceList[i];
        }
        var tasksByProject = {};
        for (var j = 0; j < taskList.length; j++) {
          var task = taskList[j];
          if (!tasksByProject[task.project_id]) tasksByProject[task.project_id] = [];
          tasksByProject[task.project_id].push(task);
        }

        var now = new Date();
        var items = [];
        for (var k = 0; k < eligible.length; k++) {
          var project = eligible[k];
          var pace = paceByProject[project.id];
          if (!pace) continue;
          var projectTasks = tasksByProject[project.id] || [];
          var paceSeconds = currentPace(projectTasks, project, pace, now);
          var remaining = remainingProgress(projectTasks, project);
          var total = totalTaskLength(projectTasks, project);
          var done = projectProgress(projectTasks, project);
          items.push({
            projectId: project.id,
            projectName: project.name,
            tag: project.tag,
            paceSeconds: paceSeconds,
            marginSeconds: paceMargin(pace),
            remainingSeconds: remaining,
            totalSeconds: total,
            doneSeconds: done,
            paceEnd: currentPaceEnd(projectTasks, project, pace),
            estimatedCompletion: estimatedCompletion(projectTasks, project, now),
            tone: paceTone(paceSeconds),
            project: project,
            tasks: projectTasks,
            pace: pace,
          });
        }

        return { projects: eligible, items: items, fetchedAt: now };
      });
    });
}

export function liveItem(item, now) {
  var paceSeconds = currentPace(item.tasks, item.project, item.pace, now);
  return {
    projectId: item.projectId,
    projectName: item.projectName,
    tag: item.tag,
    paceSeconds: paceSeconds,
    marginSeconds: item.marginSeconds,
    remainingSeconds: item.remainingSeconds,
    totalSeconds: item.totalSeconds,
    doneSeconds: item.doneSeconds,
    paceEnd: item.paceEnd,
    estimatedCompletion: estimatedCompletion(item.tasks, item.project, now),
    tone: paceTone(paceSeconds),
    project: item.project,
    tasks: item.tasks,
    pace: item.pace,
  };
}

export { formatHMS, formatPaceEnd, formatShortDate, REFRESH_MS };
