(function attachLevelUpLifeLogic(root) {
  const STATUS_VALUES = new Set(["active", "claimable", "claimed", "expired"]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uniqueStrings(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(String))];
  }

  function normalizeTask(task = {}) {
    const repeatable = task.repeatable !== false;
    return {
      ...task,
      repeatable,
      completed: repeatable ? false : Boolean(task.completed),
    };
  }

  function normalizeChallenge(challenge = {}) {
    const goalType = challenge.goalType === "score" ? "score" : "tasks";
    const status = STATUS_VALUES.has(challenge.status) ? challenge.status : "active";
    return {
      ...challenge,
      goalType,
      taskIds: uniqueStrings(challenge.taskIds),
      completedTaskIds: uniqueStrings(challenge.completedTaskIds),
      targetScore: Math.max(0, Number(challenge.targetScore) || 0),
      startEarned: Number(challenge.startEarned) || 0,
      status,
    };
  }

  function normalizeState(state = {}, defaults = {}) {
    const out = Object.assign(clone(defaults), clone(state));
    out.tasks = (Array.isArray(state.tasks) ? state.tasks : out.tasks || []).map(normalizeTask);
    out.challenges = (Array.isArray(state.challenges) ? state.challenges : out.challenges || []).map(normalizeChallenge);
    out.score = Number(out.score) || 0;
    out.earned = Number(out.earned) || 0;
    out.spent = Number(out.spent) || 0;
    return out;
  }

  function endOfDay(deadline) {
    const date = new Date(`${deadline}T23:59:59.999`);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function getChallengeProgress(challenge, state, nowMs = Date.now()) {
    const current = normalizeChallenge(challenge);
    if (current.status === "claimed") {
      return { status: "claimed", completed: 1, total: 1, percent: 100, current: 1, target: 1 };
    }

    let completed = 0;
    let total = 0;
    let progressCurrent = 0;
    let progressTarget = 0;
    if (current.goalType === "tasks") {
      total = current.taskIds.length;
      completed = current.taskIds.filter((id) => current.completedTaskIds.includes(id)).length;
      progressCurrent = completed;
      progressTarget = total;
    } else {
      progressCurrent = Math.max(0, (Number(state?.earned) || 0) - current.startEarned);
      progressTarget = current.targetScore;
      completed = progressTarget > 0 && progressCurrent >= progressTarget ? 1 : 0;
      total = 1;
    }

    const achieved = progressTarget > 0 && progressCurrent >= progressTarget;
    const expired = nowMs > endOfDay(current.deadline);
    const status = achieved ? "claimable" : expired ? "expired" : "active";
    const percent = progressTarget > 0 ? Math.min(100, Math.round((progressCurrent / progressTarget) * 100)) : 0;
    return { status, completed, total, percent, current: progressCurrent, target: progressTarget };
  }

  function refreshChallengeStatuses(state, nowMs = Date.now()) {
    const next = clone(state);
    next.challenges = (Array.isArray(next.challenges) ? next.challenges : []).map((challenge) => {
      const normalized = normalizeChallenge(challenge);
      return { ...normalized, status: getChallengeProgress(normalized, next, nowMs).status };
    });
    return next;
  }

  function completeTask(state, taskId, nowMs = Date.now()) {
    const next = clone(state);
    next.tasks = (Array.isArray(next.tasks) ? next.tasks : []).map(normalizeTask);
    next.challenges = (Array.isArray(next.challenges) ? next.challenges : []).map(normalizeChallenge);
    const task = next.tasks.find((item) => String(item.id) === String(taskId));
    if (!task || (!task.repeatable && task.completed)) {
      return { state: refreshChallengeStatuses(next, nowMs), awarded: 0 };
    }

    const points = Math.max(0, Number(task.points) || 0);
    if (!task.repeatable) task.completed = true;
    next.score = (Number(next.score) || 0) + points;
    next.earned = (Number(next.earned) || 0) + points;
    next.challenges = refreshChallengeStatuses(next, nowMs).challenges;
    next.challenges.forEach((challenge) => {
      if (
        challenge.status === "active" &&
        challenge.goalType === "tasks" &&
        challenge.taskIds.includes(String(task.id)) &&
        !challenge.completedTaskIds.includes(String(task.id))
      ) {
        challenge.completedTaskIds.push(String(task.id));
      }
    });
    return { state: refreshChallengeStatuses(next, nowMs), awarded: points };
  }

  root.LevelUpLifeLogic = {
    normalizeTask,
    normalizeChallenge,
    normalizeState,
    completeTask,
    getChallengeProgress,
    refreshChallengeStatuses,
  };
})(globalThis);
