/** Build a session queue without deduplicating slots that perform the same exercise. */
export function buildSessionQueue(dayId, plannedExercises, dayLog, exerciseRegistry, resolveId = (id) => id) {
  return (plannedExercises ?? []).map((plannedEx, index) => {
    const plannedExerciseId = resolveId(plannedEx.id);
    const slotKey = `${dayId}:${index}:${plannedExerciseId}`;
    const skipped = dayLog?.[plannedEx.id]?.skipped;
    const requestedId = skipped?.substituteId ? resolveId(skipped.substituteId) : null;
    const allowed = requestedId && requestedId !== plannedExerciseId
      && plannedEx.alternatives?.some((alt) => resolveId(alt.id) === requestedId);
    const substitute = allowed ? exerciseRegistry[requestedId] : null;
    const performed = substitute ?? plannedEx;
    return {
      ...performed,
      slotKey,
      plannedExerciseId,
      performedExerciseId: resolveId(performed.id),
      substitution: substitute
        ? {
            plannedExerciseId,
            performedExerciseId: resolveId(substitute.id),
            source: skipped?.attribution?.source ?? 'user_selection',
            reason: skipped?.reason ?? null
          }
        : null
    };
  });
}
