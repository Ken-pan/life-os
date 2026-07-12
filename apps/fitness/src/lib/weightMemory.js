const STARTING_WEIGHT_SCHEMES = new Set([
  'ascending',
  'descending',
  'pyramid',
  'reverse_pyramid',
  'drop'
]);

export function carriesStartingWeight(ex) {
  return STARTING_WEIGHT_SCHEMES.has(ex?.scheme);
}

function recordedWeights(sets) {
  return (sets || [])
    .filter((set) => set && Number.isFinite(Number(set.weight)))
    .map((set) => Number(set.weight));
}

/**
 * Pick the load that should carry forward to the next workout.
 *
 * Straight sets use the last performed set, because a mid-session load change is
 * the athlete's latest decision. Ramp/pyramid/drop schemes carry their first
 * work-set load forward so an intentional back-off set does not become the next
 * session's starting load.
 */
export function carryForwardWeight(ex, sets) {
  const weights = recordedWeights(sets);
  if (!weights.length) return null;
  return carriesStartingWeight(ex) ? weights[0] : weights.at(-1);
}
