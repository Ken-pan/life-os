-- Scope every Fitness ownership policy to signed-in users before evaluating
-- private.has_app_access(). Without an explicit role, anon SELECTs attempt to
-- execute the private helper and fail with 42501 instead of returning no rows.

alter policy "fitness_profiles_select_own"
  on fitness.fitness_profiles to authenticated;
alter policy "fitness_profiles_insert_own"
  on fitness.fitness_profiles to authenticated;
alter policy "fitness_profiles_update_own"
  on fitness.fitness_profiles to authenticated;

alter policy "fitness_user_state_select_own"
  on fitness.fitness_user_state to authenticated;
alter policy "fitness_user_state_insert_own"
  on fitness.fitness_user_state to authenticated;
alter policy "fitness_user_state_update_own"
  on fitness.fitness_user_state to authenticated;

alter policy "fitness_exercise_weights_select_own"
  on fitness.fitness_exercise_weights to authenticated;
alter policy "fitness_exercise_weights_insert_own"
  on fitness.fitness_exercise_weights to authenticated;
alter policy "fitness_exercise_weights_update_own"
  on fitness.fitness_exercise_weights to authenticated;
alter policy "fitness_exercise_weights_delete_own"
  on fitness.fitness_exercise_weights to authenticated;

alter policy "fitness_workout_sessions_select_own"
  on fitness.fitness_workout_sessions to authenticated;
alter policy "fitness_workout_sessions_insert_own"
  on fitness.fitness_workout_sessions to authenticated;
alter policy "fitness_workout_sessions_update_own"
  on fitness.fitness_workout_sessions to authenticated;
alter policy "fitness_workout_sessions_delete_own"
  on fitness.fitness_workout_sessions to authenticated;

alter policy "fitness_exercise_logs_select_own"
  on fitness.fitness_exercise_logs to authenticated;
alter policy "fitness_exercise_logs_insert_own"
  on fitness.fitness_exercise_logs to authenticated;
alter policy "fitness_exercise_logs_update_own"
  on fitness.fitness_exercise_logs to authenticated;
alter policy "fitness_exercise_logs_delete_own"
  on fitness.fitness_exercise_logs to authenticated;
