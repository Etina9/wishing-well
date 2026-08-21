(function attachLevelUpLifeLogic(root) {
  const STATUS_VALUES = new Set(["active", "claimable", "claimed", "expired"]);
  const NORMAL_REWARD_TIER_ODDS = Object.freeze({ small: 0.7, medium: 0.22, large: 0.07, grand: 0.01 });
  const NORMAL_REWARD_TIERS = Object.freeze(["small", "medium", "large", "grand"]);
  const NORMAL_BOX_SIZE = 50;
  const NORMAL_BOX_TIER_COUNTS = Object.freeze({ small: 35, medium: 10, large: 4, grand: 1 });
  const DEFAULT_TASK_CATEGORIES = Object.freeze([
    Object.freeze({ name: "减肥 / 运动", multiplier: 1, hot: false, builtIn: true }),
    Object.freeze({ name: "工作 / 面试", multiplier: 2, hot: true, builtIn: true }),
    Object.freeze({ name: "语言学习", multiplier: 1, hot: false, builtIn: true }),
    Object.freeze({ name: "其他", multiplier: 1, hot: false, builtIn: true }),
  ]);
  const SPECIAL_CARD_RARITY_ODDS = Object.freeze({ ordinary: 0.75, rare: 0.2, legendary: 0.05 });
  const SPECIAL_CARD_CATALOG = Object.freeze([
    { id: "again", rarity: 1, icon: "🎫", name: "再来一次", description: "本次抽奖结果不满意，可以重抽一次。" },
    { id: "free-draw", rarity: 1, icon: "🎁", name: "免费一番赏", description: "免费抽一次普通一番赏。" },
    { id: "two-choice", rarity: 1, icon: "👀", name: "二选一", description: "抽两个结果，选择其中一个。" },
    { id: "hold-prize", rarity: 1, icon: "💾", name: "保留卡", description: "抽到奖励后可以暂时不兑换，留到以后。" },
    { id: "dessert-pass", rarity: 1, icon: "🎫", name: "免罪券", description: "今天可以吃一次想吃的甜品，不扣减计划。" },
    { id: "coffee-pass", rarity: 1, icon: "☕", name: "咖啡券", description: "兑换一次喜欢的饮品，不扣减计划。" },
    { id: "rest-pass", rarity: 1, icon: "🛋️", name: "休息券", description: "无条件休息 30 分钟。" },
    { id: "delay-pass", rarity: 1, icon: "⏰", name: "延期券", description: "将一个普通任务顺延一天。" },
    { id: "upgrade-draw", rarity: 2, icon: "⬆️", name: "升赏卡", description: "下一次普通一番赏抽 3 个结果，选择 1 个。" },
    { id: "wish-sniper", rarity: 2, icon: "🎯", name: "心愿狙击", description: "从普通一番赏随机抽 3 个结果，自己选 1 个。" },
    { id: "free-medium-draw", rarity: 2, icon: "🎫", name: "免费一番赏·稀有", description: "免费抽一次普通一番赏。" },
    { id: "regret-pill", rarity: 2, icon: "🔁", name: "后悔药", description: "最近一次抽奖可以重抽。" },
    { id: "task-boost", rarity: 2, icon: "✨", name: "升级券", description: "下一次任务积分增加 50%，额外增加最多 3 分。" },
    { id: "direct-redeem", rarity: 3, icon: "🌟", name: "指定兑换", description: "从小赏区的现有奖励中任选一个。" },
    { id: "free-large-draw", rarity: 3, icon: "🎁", name: "免费一番赏·传说", description: "免费抽一次普通一番赏。" },
    { id: "wish-come-true", rarity: 3, icon: "✨", name: "愿望成真", description: "指定一个 100 元以内、奖池外的心愿直接兑换。" },
    { id: "time-pause", rarity: 3, icon: "🕰️", name: "时间暂停", description: "将一个限时挑战延长 1 天，每个挑战最多使用一次。" },
    { id: "slack-pass", rarity: 3, icon: "🛌", name: "偷懒券", description: "周末任选一天摆烂，不需要完成普通任务。" },
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uniqueStrings(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(String))];
  }

  function normalizeTaskCategories(categories = [], tasks = []) {
    const defaultsByName = new Map(DEFAULT_TASK_CATEGORIES.map((category) => [category.name, category]));
    const names = [];
    const add = (value, fallback = {}) => {
      const name = String(typeof value === "string" ? value : value?.name || "").trim();
      if (!name || names.includes(name)) return;
      const builtIn = defaultsByName.get(name);
      names.push(name);
      result.push({
        name,
        multiplier: builtIn?.multiplier || Math.max(1, Number(value?.multiplier) || 1),
        hot: builtIn?.hot || Boolean(value?.hot),
        builtIn: builtIn?.builtIn || Boolean(value?.builtIn || fallback.builtIn),
      });
    };
    const result = [];
    DEFAULT_TASK_CATEGORIES.forEach((category) => add(category));
    (Array.isArray(categories) ? categories : []).forEach((category) => add(category));
    (Array.isArray(tasks) ? tasks : []).forEach((task) => add(task?.category));
    return result;
  }

  function getTaskCategory(state, categoryName) {
    const name = String(categoryName || "其他").trim() || "其他";
    const categories = normalizeTaskCategories(state?.taskCategories, state?.tasks);
    return categories.find((category) => category.name === name) || { name, multiplier: 1, hot: false, builtIn: false };
  }

  function setTaskCategoryHot(state, categoryName, enabled = true) {
    const next = clone(state);
    const name = String(categoryName || "").trim();
    next.taskCategories = normalizeTaskCategories(next.taskCategories, next.tasks).map((category) => {
      if (category.name !== name) return category;
      const hot = Boolean(enabled);
      return { ...category, hot, multiplier: hot ? 2 : 1 };
    });
    return next;
  }

  function normalizeTaskCheckIns(checkIns = {}) {
    if (!checkIns || typeof checkIns !== "object") return {};
    const output = {};
    Object.entries(checkIns).forEach(([taskId, dates]) => {
      if (!dates || typeof dates !== "object") return;
      const cleanDates = {};
      Object.entries(dates).forEach(([dateKey, checked]) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey) && checked) cleanDates[dateKey] = true;
      });
      if (Object.keys(cleanDates).length) output[String(taskId)] = cleanDates;
    });
    return output;
  }

  function recordTaskCheckIn(state, taskId, dateKey, checked = true) {
    const next = clone(state);
    const id = String(taskId || "");
    const key = String(dateKey || "");
    next.tasks = (Array.isArray(next.tasks) ? next.tasks : []).map(normalizeTask);
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(key) || !next.tasks.some((task) => String(task.id) === id)) return { state: next, changed: false };
    next.taskCheckIns = normalizeTaskCheckIns(next.taskCheckIns);
    const dates = { ...(next.taskCheckIns[id] || {}) };
    if (checked) dates[key] = true;
    else delete dates[key];
    if (Object.keys(dates).length) next.taskCheckIns[id] = dates;
    else delete next.taskCheckIns[id];
    return { state: next, changed: true, checked: Boolean(checked) };
  }

  function getCheckInGrid(state, taskId, nowMs = Date.now(), weeks = 4) {
    return buildCheckInGrid(state, nowMs, weeks, (dateKey) => Boolean(state?.taskCheckIns?.[String(taskId)]?.[dateKey]));
  }

  function getOverallCheckInGrid(state, nowMs = Date.now(), weeks = 4) {
    const counts = {};
    Object.values(normalizeTaskCheckIns(state?.taskCheckIns)).forEach((dates) => {
      Object.keys(dates).forEach((dateKey) => { counts[dateKey] = (counts[dateKey] || 0) + 1; });
    });
    return buildCheckInGrid(state, nowMs, weeks, (dateKey) => counts[dateKey] || 0);
  }

  function buildCheckInGrid(state, nowMs, weeks, valueForDate) {
    const rowCount = Math.max(1, Math.floor(Number(weeks) || 4));
    const todayKey = localDateKeyFromMs(nowMs);
    const today = new Date(nowMs);
    today.setHours(12, 0, 0, 0);
    const mondayOffset = (today.getDay() + 6) % 7;
    today.setDate(today.getDate() - mondayOffset - (rowCount - 1) * 7);
    const rows = [];
    for (let row = 0; row < rowCount; row += 1) {
      const days = [];
      for (let column = 0; column < 7; column += 1) {
        const date = new Date(today);
        date.setDate(today.getDate() + row * 7 + column);
        const dateKey = localDateKeyFromMs(date.getTime());
        days.push({ dateKey, checked: Boolean(valueForDate(dateKey)), count: Number(valueForDate(dateKey)) || 0, isToday: dateKey === todayKey, isFuture: dateKey > todayKey });
      }
      rows.push(days);
    }
    return { weeks: rows, todayKey };
  }

  function normalizeSpecialCards(cards) {
    const knownIds = new Set(SPECIAL_CARD_CATALOG.map((card) => card.id));
    const out = {};
    if (!cards || typeof cards !== "object") return out;
    Object.entries(cards).forEach(([id, count]) => {
      if (!knownIds.has(id)) return;
      const safeCount = Math.max(0, Math.floor(Number(count) || 0));
      if (safeCount > 0) out[id] = safeCount;
    });
    return out;
  }

  function legacyTierForCost(cost) {
    const value = Number(cost) || 5;
    if (value <= 5) return "small";
    if (value <= 10) return "medium";
    if (value <= 20) return "large";
    return "grand";
  }

  function normalizeRewardItem(item, fallbackTier = "small") {
    if (typeof item === "string") return { name: item, tier: fallbackTier };
    const name = String(item?.name || item?.title || "").trim();
    const tier = NORMAL_REWARD_TIERS.includes(item?.tier) ? item.tier : fallbackTier;
    return name ? { ...item, name, tier } : null;
  }

  function normalizePools(pools) {
    const items = [];
    (Array.isArray(pools) ? pools : []).forEach((pool) => {
      const fallbackTier = legacyTierForCost(pool?.cost);
      (Array.isArray(pool?.items) ? pool.items : []).forEach((item) => {
        const normalized = normalizeRewardItem(item, fallbackTier);
        if (normalized) items.push(normalized);
      });
    });
    return [{ cost: 5, budget: "普通一番赏", items }];
  }

  function normalizeRewardItems(items) {
    return normalizePools([{ cost: 5, budget: "普通一番赏", items }])[0].items;
  }

  function parseBulkRewardText(raw) {
    const aliases = {
      small: "small", "小": "small", "小赏": "small",
      medium: "medium", "中": "medium", "中赏": "medium",
      large: "large", "大": "large", "大赏": "large",
      grand: "grand", "超大": "grand", "大奖": "grand", "300元大奖": "grand",
    };
    const items = [];
    const errors = [];
    let currentTier = "small";
    String(raw || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line, index) => {
      const heading = line.match(/^(小|小赏|中|中赏|大|大赏|超大|大奖)\s*[：:]\s*(.*)$/);
      if (heading) {
        currentTier = aliases[heading[1]];
        if (heading[2].trim()) items.push({ name: heading[2].trim(), tier: currentTier });
        return;
      }

      const parts = line.split(/\s*(?:\||,|，|\t)\s*/);
      const name = String(parts[0] || "").trim();
      const explicitTier = parts.length > 1 ? aliases[String(parts[1] || "").trim().toLowerCase()] : currentTier;
      if (!name) {
        errors.push(`第 ${index + 1} 行没有奖品名称`);
      } else if (!explicitTier) {
        errors.push(`第 ${index + 1} 行档位无效`);
      } else {
        items.push({ name, tier: explicitTier });
      }
    });
    return { items, errors };
  }

  function validateNormalBoxComposition(existingItems = [], incomingItems = []) {
    const counts = Object.fromEntries(NORMAL_REWARD_TIERS.map((tier) => [tier, 0]));
    [...(Array.isArray(existingItems) ? existingItems : []), ...(Array.isArray(incomingItems) ? incomingItems : [])]
      .forEach((item) => {
        if (Object.prototype.hasOwnProperty.call(counts, item?.tier)) counts[item.tier] += 1;
      });
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const remaining = Object.fromEntries(NORMAL_REWARD_TIERS.map((tier) => [tier, NORMAL_BOX_TIER_COUNTS[tier] - counts[tier]]));
    const valid = total === NORMAL_BOX_SIZE && NORMAL_REWARD_TIERS.every((tier) => counts[tier] === NORMAL_BOX_TIER_COUNTS[tier]);
    return { valid, total, counts, target: { ...NORMAL_BOX_TIER_COUNTS }, remaining };
  }

  function chooseNormalRewardTier(roll = Math.random) {
    const value = Math.min(0.999999999, Math.max(0, Number(typeof roll === "function" ? roll() : roll) || 0));
    let cursor = 0;
    for (const tier of NORMAL_REWARD_TIERS) {
      cursor += NORMAL_REWARD_TIER_ODDS[tier];
      if (value < cursor) return tier;
    }
    return "grand";
  }

  function drawNormalReward(state, random = Math.random) {
    const current = normalizeState(state);
    const pool = current.pools[0];
    const template = current.normalBoxTemplate;
    const legacyActiveBox = template.length === 48 && pool.items.length > 0;
    if (template.length !== NORMAL_BOX_SIZE && !legacyActiveBox) {
      return { state: current, reward: null, reason: template.length ? "box-incomplete" : "box-empty", openedNewBox: false };
    }

    let openedNewBox = false;
    if (pool.items.length === 0) {
      pool.items = clone(template);
      current.normalBoxNumber += 1;
      current.normalBoxCurrentSize = NORMAL_BOX_SIZE;
      openedNewBox = true;
    }

    const roll = Math.min(0.999999999, Math.max(0, Number(random()) || 0));
    const index = Math.min(pool.items.length - 1, Math.floor(roll * pool.items.length));
    const [reward] = pool.items.splice(index, 1);
    return { state: current, reward, openedNewBox, remaining: pool.items.length };
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
    out.taskCategories = normalizeTaskCategories(out.taskCategories, out.tasks);
    out.taskCheckIns = normalizeTaskCheckIns(out.taskCheckIns);
    out.challenges = (Array.isArray(state.challenges) ? state.challenges : out.challenges || []).map(normalizeChallenge);
    out.score = Number(out.score) || 0;
    out.earned = Number(out.earned) || 0;
    out.spent = Number(out.spent) || 0;
    out.pools = normalizePools(out.pools);
    const hasBoxTemplate = Object.prototype.hasOwnProperty.call(state, "normalBoxTemplate");
    out.normalBoxTemplate = normalizeRewardItems(hasBoxTemplate ? state.normalBoxTemplate : out.pools[0].items);
    if (!hasBoxTemplate && ![48, NORMAL_BOX_SIZE].includes(out.normalBoxTemplate.length)) {
      out.pools[0].items = [];
    }
    out.normalBoxNumber = Math.max(1, Math.floor(Number(out.normalBoxNumber) || 1));
    const legacyCurrentBox = out.normalBoxTemplate.length === 48 && out.pools[0].items.length > 0;
    out.normalBoxCurrentSize = Math.max(1, Math.floor(Number(out.normalBoxCurrentSize) || (legacyCurrentBox ? 48 : NORMAL_BOX_SIZE)));
    out.luckyCoins = Math.max(0, Math.floor(Number(out.luckyCoins) || 0));
    out.specialCardPity = Math.max(0, Math.floor(Number(out.specialCardPity) || 0));
    out.specialCards = normalizeSpecialCards(out.specialCards);
    out.dailyTaskCompletions = out.dailyTaskCompletions && typeof out.dailyTaskCompletions === "object"
      ? { ...out.dailyTaskCompletions }
      : {};
    out.luckyCoinAwards = out.luckyCoinAwards && typeof out.luckyCoinAwards === "object"
      ? { ...out.luckyCoinAwards }
      : {};
    out.dailyLuckyCoinDate = typeof out.dailyLuckyCoinDate === "string" ? out.dailyLuckyCoinDate : "";
    out.nextTaskMultiplier = Math.max(1, Number(out.nextTaskMultiplier) || 1);
    out.lastDraw = out.lastDraw && typeof out.lastDraw === "object" ? { ...out.lastDraw } : null;
    out.lastSpecialCard = out.lastSpecialCard && typeof out.lastSpecialCard === "object" ? { ...out.lastSpecialCard } : null;
    out.heldPrizes = Array.isArray(out.heldPrizes) ? out.heldPrizes.slice(0, 30) : [];
    out.challengePauseUsed = out.challengePauseUsed && typeof out.challengePauseUsed === "object"
      ? { ...out.challengePauseUsed }
      : {};
    return out;
  }

  function claimDailyLuckyCoin(state, dateKey) {
    const next = normalizeState(state);
    const key = String(dateKey || "");
    if (!key || next.dailyLuckyCoinDate === key) return { state: next, awarded: 0 };
    next.dailyLuckyCoinDate = key;
    next.luckyCoins += 1;
    return { state: next, awarded: 1 };
  }

  function localDateKeyFromMs(nowMs) {
    const date = new Date(nowMs);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function drawSpecialCard(state, random = Math.random) {
    const current = normalizeState(state);
    if (current.luckyCoins < 1) return { state: clone(state), card: null, pity: false };

    const roll = Math.min(0.999999999, Math.max(0, Number(random()) || 0));
    const pity = current.specialCardPity >= 4;
    let rarity;
    if (pity) {
      rarity = roll < 0.95 ? 2 : 3;
    } else if (roll < SPECIAL_CARD_RARITY_ODDS.ordinary) {
      rarity = 1;
    } else if (roll < SPECIAL_CARD_RARITY_ODDS.ordinary + SPECIAL_CARD_RARITY_ODDS.rare) {
      rarity = 2;
    } else {
      rarity = 3;
    }

    const cards = SPECIAL_CARD_CATALOG.filter((card) => card.rarity === rarity);
    const cardIndex = Math.min(cards.length - 1, Math.floor(Math.min(0.999999999, Math.max(0, Number(random()) || 0)) * cards.length));
    const card = cards[cardIndex];
    const next = normalizeState(current);
    next.luckyCoins -= 1;
    next.specialCardPity = rarity === 1 ? current.specialCardPity + 1 : 0;
    next.specialCards[card.id] = (next.specialCards[card.id] || 0) + 1;
    return { state: next, card, pity };
  }

  function recordTaskCompletionForLuckyCoins(state, nowMs = Date.now()) {
    const next = normalizeState(state);
    const dateKey = localDateKeyFromMs(nowMs);
    next.dailyTaskCompletions[dateKey] = (Number(next.dailyTaskCompletions[dateKey]) || 0) + 1;
    const awards = [];
    if (next.dailyTaskCompletions[dateKey] >= 3 && !next.luckyCoinAwards[`daily-3-${dateKey}`]) {
      next.luckyCoinAwards[`daily-3-${dateKey}`] = true;
      next.luckyCoins += 1;
      awards.push("daily-3");
    }
    let streak = 0;
    const cursor = new Date(nowMs);
    while (next.dailyTaskCompletions[localDateKeyFromMs(cursor.getTime())] > 0) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    const streakKey = `streak-${dateKey}`;
    if (streak >= 7 && streak % 7 === 0 && !next.luckyCoinAwards[streakKey]) {
      next.luckyCoinAwards[streakKey] = true;
      next.luckyCoins += 1;
      awards.push("streak-7");
    }
    return { state: next, awards };
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

    const category = getTaskCategory(next, task.category);
    const categoryMultiplier = Math.max(1, Number(category.multiplier) || 1);
    const multiplier = Math.max(1, Number(next.nextTaskMultiplier) || 1);
    const basePoints = Math.max(0, Number(task.points) || 0);
    const categorizedPoints = basePoints * categoryMultiplier;
    const points = Math.max(0, Math.min(categorizedPoints * multiplier, categorizedPoints + 3));
    next.nextTaskMultiplier = 1;
    if (!task.repeatable) task.completed = true;
    next.score = (Number(next.score) || 0) + points;
    next.earned = (Number(next.earned) || 0) + points;
    const coinResult = recordTaskCompletionForLuckyCoins(next, nowMs);
    next.luckyCoins = coinResult.state.luckyCoins;
    next.dailyTaskCompletions = coinResult.state.dailyTaskCompletions;
    next.luckyCoinAwards = coinResult.state.luckyCoinAwards;
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
    next.taskCheckIns = normalizeTaskCheckIns(next.taskCheckIns);
    const checkInDate = localDateKeyFromMs(nowMs);
    next.taskCheckIns[String(task.id)] = { ...(next.taskCheckIns[String(task.id)] || {}), [checkInDate]: true };
    return {
      state: refreshChallengeStatuses(next, nowMs),
      awarded: points,
      category: category.name,
      categoryMultiplier,
      hot: category.hot,
    };
  }

  root.LevelUpLifeLogic = {
    SPECIAL_CARD_CATALOG,
    SPECIAL_CARD_RARITY_ODDS,
    DEFAULT_TASK_CATEGORIES,
    NORMAL_REWARD_TIER_ODDS,
    NORMAL_REWARD_TIERS,
    NORMAL_BOX_SIZE,
    NORMAL_BOX_TIER_COUNTS,
    normalizeTask,
    normalizeTaskCategories,
    getTaskCategory,
    setTaskCategoryHot,
    normalizeTaskCheckIns,
    recordTaskCheckIn,
    getTaskCheckInGrid: getCheckInGrid,
    getOverallCheckInGrid,
    normalizeChallenge,
    normalizeState,
    claimDailyLuckyCoin,
    normalizePools,
    parseBulkRewardText,
    validateNormalBoxComposition,
    chooseNormalRewardTier,
    drawNormalReward,
    drawSpecialCard,
    recordTaskCompletionForLuckyCoins,
    completeTask,
    getChallengeProgress,
    refreshChallengeStatuses,
  };
})(globalThis);
