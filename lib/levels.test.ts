import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, resolveActiveLevel, getDemotionFloor, computePeakLevelFromEquity } from './levels.ts';

test('getDemotionFloor calculations', () => {
  assert.equal(getDemotionFloor(0), 0);
  // Level 1: target 300, risk 30 -> 300 - 150 = 150
  assert.equal(getDemotionFloor(1), 150);
  // Level 2: target 600, risk 60 -> 600 - 300 = 300
  assert.equal(getDemotionFloor(2), 300);
});

test('resolveActiveLevel - basic level up from balance', () => {
  const res = resolveActiveLevel(350, 0);
  assert.equal(res.activeLevelIdx, 1);
  assert.equal(res.newHighestAchieved, true);
  assert.equal(res.activeLevel.rank, 'Market Apprentice');
});

test('resolveActiveLevel - 5R buffer prevents demotion on single lost trade', () => {
  // User reached Level 1 (stored highest = 1), but lost a trade bringing balance to $270
  // Demotion floor for Level 1 is $150
  const res = resolveActiveLevel(270, 1);
  assert.equal(res.activeLevelIdx, 1);
  assert.equal(res.newHighestAchieved, false);
  assert.equal(res.activeLevel.risk, 30);
});

test('resolveActiveLevel - demotion happens when balance drops below 5R floor', () => {
  // User was Level 1 (highest = 1), balance drops to $140 (< $150 floor)
  const res = resolveActiveLevel(140, 1);
  assert.equal(res.activeLevelIdx, 0); // demoted to Novice
  assert.equal(res.activeLevel.risk, 15);
});

test('computePeakLevelFromEquity - correctly computes historical peak level from equity points', () => {
  const points = [
    { value: 150 },
    { value: 250 },
    { value: 312.03 }, // Peak on July 29th -> Level 1 ($300)
    { value: 301.03 },
    { value: 268.39 },
  ];
  assert.equal(computePeakLevelFromEquity(points, 150), 1);
});
