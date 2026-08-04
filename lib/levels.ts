export interface Level {
  level: number;
  rank: string;
  target: number;
  risk: number;
  description: string;
  focus: string;
}

export const LEVELS: Level[] = [
  { level: 0, rank: "Novice Cadet", target: 150, risk: 15, description: "Focus on execution and discipline. Stick to your strategy rules without looking at the dollar amount.", focus: "Rules & Execution" },
  { level: 1, rank: "Market Apprentice", target: 300, risk: 30, description: "Consistency is key. Capital doubled, demonstrating initial risk control and market survival.", focus: "Risk Consistency" },
  { level: 2, rank: "Risk Practitioner", target: 600, risk: 60, description: "Adjusting to size. Begin navigating larger absolute dollar values while keeping percentages identical.", focus: "Size Comfort" },
  { level: 3, rank: "Discipline Enforcer", target: 1200, risk: 120, description: "Mastering emotional control. The stakes are rising; trade your plan, not your feelings.", focus: "Emotional Detachment" },
  { level: 4, rank: "Trend Navigator", target: 2400, risk: 240, description: "Adapting to market phases. Execute trend structures and range regimes with identical precision.", focus: "Plan Obedience" },
  { level: 5, rank: "Capital Guardian", target: 4800, risk: 480, description: "Capital preservation becomes a habit. Shielding your base capital is more important than chasing gains.", focus: "Capital Shielding" },
  { level: 6, rank: "Edge Specialist", target: 9600, risk: 960, description: "Deep conviction in your edge. Let the statistics play out over large sample sizes of trades.", focus: "Edge Conviction" },
  { level: 7, rank: "Sovereign Trader", target: 19200, risk: 1920, description: "Absolute independence. Select only the highest probability setups; ignore all market noise.", focus: "Setup Quality" },
  { level: 8, rank: "Tactical Veteran", target: 38400, risk: 3840, description: "Drawdown tolerance. Manage normal equity dips with complete calmness and statistical perspective.", focus: "Drawdown Mastery" },
  { level: 9, rank: "Market Operator", target: 76800, risk: 7680, description: "Scaling positions smoothly. The operational rules remain the same; size is the only variable.", focus: "Precision Scaling" },
  { level: 10, rank: "Portfolio Architect", target: 153600, risk: 15360, description: "Thinking in portfolio terms. Manage correlation, exposure times, and multi-asset risk.", focus: "Exposure Control" },
  { level: 11, rank: "Apex Strategist", target: 307200, risk: 30720, description: "High-conviction trading. Remain grounded in risk parameters even as account sizes become substantial.", focus: "Size Conviction" },
  { level: 12, rank: "Macro Voyager", target: 614400, risk: 61440, description: "Patience at the gates. The final hurdle to the million-dollar target. Stay structured, do not rush.", focus: "Milestone Patience" },
  { level: 13, rank: "Market Legend", target: 1000000, risk: 100000, description: "The ultimate mastery of trading edge, execution, and psychological control.", focus: "Infinite Game" }
];

/**
 * Calculates the demotion floor for a given level.
 * Demotion floor = Level Target - (5 * Level Risk).
 *
 * For example:
 * Level 1 (target: 300, risk: 30) -> demotion floor = 300 - 150 = 150.
 * Level 2 (target: 600, risk: 60) -> demotion floor = 600 - 300 = 300.
 */
export function getDemotionFloor(levelIndex: number): number {
  if (levelIndex <= 0) return 0;
  const lvl = LEVELS[levelIndex];
  if (!lvl) return 0;
  return Math.max(0, lvl.target - 5 * lvl.risk);
}

export interface LevelResolutionResult {
  /** The effective active level index considering high-water mark and 5R demotion buffer. */
  activeLevelIdx: number;
  /** The active level object. */
  activeLevel: Level;
  /** Next level object (or null if max level). */
  nextLevel: Level | null;
  /** True if the user just achieved a higher level than their previous stored highestAchievedLevel. */
  newHighestAchieved: boolean;
  /** The level index reached by current balance alone (ignoring high water mark). */
  computedLevelIdx: number;
  /** Balance floor below which demotion to previous level occurs. */
  demotionFloor: number;
}

/**
 * Resolves the active level for a given account balance and user's highest achieved level.
 *
 * Logic:
 * 1. Calculate computed level based purely on balance target threshold.
 * 2. Effective level starts at max(computedLevel, highestAchievedLevel).
 * 3. Demotion Buffer Rule (5R): Demotion only occurs if balance falls BELOW the demotion floor of effective level.
 *    If balance < demotionFloor(effectiveLevel), step down level by level until balance >= demotionFloor(level) or level 0.
 * 4. If resulting active level > highestAchievedLevel, mark newHighestAchieved = true.
 */
export function resolveActiveLevel(
  currentBalance: number,
  highestAchievedLevel: number = 0
): LevelResolutionResult {
  // 1. Compute baseline level from current balance
  let computedLevelIdx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (currentBalance >= LEVELS[i].target) {
      computedLevelIdx = i;
    } else {
      break;
    }
  }

  // 2. Start effective level at max(computed, stored highest)
  let activeLevelIdx = Math.max(computedLevelIdx, Math.min(highestAchievedLevel, LEVELS.length - 1));

  // 3. Apply 5R demotion buffer check
  while (activeLevelIdx > 0) {
    const floor = getDemotionFloor(activeLevelIdx);
    if (currentBalance < floor) {
      activeLevelIdx--;
    } else {
      break;
    }
  }

  const newHighestAchieved = activeLevelIdx > highestAchievedLevel;
  const activeLevel = LEVELS[activeLevelIdx];
  const nextLevel = activeLevelIdx < LEVELS.length - 1 ? LEVELS[activeLevelIdx + 1] : null;
  const demotionFloor = getDemotionFloor(activeLevelIdx);

  return {
    activeLevelIdx,
    activeLevel,
    nextLevel,
    newHighestAchieved,
    computedLevelIdx,
    demotionFloor,
  };
}

/**
 * Calculates the highest level achieved across a historical equity curve.
 */
export function computePeakLevelFromEquity(
  equityPoints: Array<{ value: number }>,
  startingBalance: number
): number {
  let peakBalance = startingBalance;
  for (const pt of equityPoints) {
    if (pt.value > peakBalance) {
      peakBalance = pt.value;
    }
  }
  let peakLevelIdx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (peakBalance >= LEVELS[i].target) {
      peakLevelIdx = i;
    } else {
      break;
    }
  }
  return peakLevelIdx;
}

