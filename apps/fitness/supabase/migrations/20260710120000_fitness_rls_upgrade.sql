-- Phase 4: Fitness RLS Security Upgrade

-- 1. profiles
drop policy if exists "profiles_select_own" on fitness.fitness_profiles;
drop policy if exists "fitness_profiles_select_own" on fitness.fitness_profiles;
create policy "fitness_profiles_select_own" on fitness.fitness_profiles for select
  using ((select auth.uid()) = id and private.has_app_access('fitness'));

drop policy if exists "profiles_insert_own" on fitness.fitness_profiles;
drop policy if exists "fitness_profiles_insert_own" on fitness.fitness_profiles;
create policy "fitness_profiles_insert_own" on fitness.fitness_profiles for insert
  with check ((select auth.uid()) = id and private.has_app_access('fitness'));

drop policy if exists "profiles_update_own" on fitness.fitness_profiles;
drop policy if exists "fitness_profiles_update_own" on fitness.fitness_profiles;
create policy "fitness_profiles_update_own" on fitness.fitness_profiles for update
  using ((select auth.uid()) = id and private.has_app_access('fitness'))
  with check ((select auth.uid()) = id and private.has_app_access('fitness'));

-- 2. user_state
drop policy if exists "user_state_select_own" on fitness.fitness_user_state;
drop policy if exists "fitness_user_state_select_own" on fitness.fitness_user_state;
create policy "fitness_user_state_select_own" on fitness.fitness_user_state for select
  using ((select auth.uid()) = user_id and private.has_app_access('fitness'));

drop policy if exists "user_state_insert_own" on fitness.fitness_user_state;
drop policy if exists "fitness_user_state_insert_own" on fitness.fitness_user_state;
create policy "fitness_user_state_insert_own" on fitness.fitness_user_state for insert
  with check ((select auth.uid()) = user_id and private.has_app_access('fitness'));

drop policy if exists "user_state_update_own" on fitness.fitness_user_state;
drop policy if exists "fitness_user_state_update_own" on fitness.fitness_user_state;
create policy "fitness_user_state_update_own" on fitness.fitness_user_state for update
  using ((select auth.uid()) = user_id and private.has_app_access('fitness'))
  with check ((select auth.uid()) = user_id and private.has_app_access('fitness'));

-- 3. exercise_weights
drop policy if exists "exercise_weights_select_own" on fitness.fitness_exercise_weights;
drop policy if exists "fitness_exercise_weights_select_own" on fitness.fitness_exercise_weights;
create policy "fitness_exercise_weights_select_own" on fitness.fitness_exercise_weights for select
  using ((select auth.uid()) = user_id and private.has_app_access('fitness'));

drop policy if exists "exercise_weights_insert_own" on fitness.fitness_exercise_weights;
drop policy if exists "fitness_exercise_weights_insert_own" on fitness.fitness_exercise_weights;
create policy "fitness_exercise_weights_insert_own" on fitness.fitness_exercise_weights for insert
  with check ((select auth.uid()) = user_id and private.has_app_access('fitness'));

drop policy if exists "exercise_weights_update_own" on fitness.fitness_exercise_weights;
drop policy if exists "fitness_exercise_weights_update_own" on fitness.fitness_exercise_weights;
create policy "fitness_exercise_weights_update_own" on fitness.fitness_exercise_weights for update
  using ((select auth.uid()) = user_id and private.has_app_access('fitness'))
  with check ((select auth.uid()) = user_id and private.has_app_access('fitness'));

drop policy if exists "exercise_weights_delete_own" on fitness.fitness_exercise_weights;
drop policy if exists "fitness_exercise_weights_delete_own" on fitness.fitness_exercise_weights;
create policy "fitness_exercise_weights_delete_own" on fitness.fitness_exercise_weights for delete
  using ((select auth.uid()) = user_id and private.has_app_access('fitness'));

-- 4. workout_sessions
drop policy if exists "workout_sessions_select_own" on fitness.fitness_workout_sessions;
drop policy if exists "fitness_workout_sessions_select_own" on fitness.fitness_workout_sessions;
create policy "fitness_workout_sessions_select_own" on fitness.fitness_workout_sessions for select
  using ((select auth.uid()) = user_id and private.has_app_access('fitness'));

drop policy if exists "workout_sessions_insert_own" on fitness.fitness_workout_sessions;
drop policy if exists "fitness_workout_sessions_insert_own" on fitness.fitness_workout_sessions;
create policy "fitness_workout_sessions_insert_own" on fitness.fitness_workout_sessions for insert
  with check ((select auth.uid()) = user_id and private.has_app_access('fitness'));

drop policy if exists "workout_sessions_update_own" on fitness.fitness_workout_sessions;
drop policy if exists "fitness_workout_sessions_update_own" on fitness.fitness_workout_sessions;
create policy "fitness_workout_sessions_update_own" on fitness.fitness_workout_sessions for update
  using ((select auth.uid()) = user_id and private.has_app_access('fitness'))
  with check ((select auth.uid()) = user_id and private.has_app_access('fitness'));

drop policy if exists "workout_sessions_delete_own" on fitness.fitness_workout_sessions;
drop policy if exists "fitness_workout_sessions_delete_own" on fitness.fitness_workout_sessions;
create policy "fitness_workout_sessions_delete_own" on fitness.fitness_workout_sessions for delete
  using ((select auth.uid()) = user_id and private.has_app_access('fitness'));

-- 5. exercise_logs
drop policy if exists "exercise_logs_select_own" on fitness.fitness_exercise_logs;
drop policy if exists "fitness_exercise_logs_select_own" on fitness.fitness_exercise_logs;
create policy "fitness_exercise_logs_select_own" on fitness.fitness_exercise_logs for select
  using ((select auth.uid()) = user_id and private.has_app_access('fitness'));

drop policy if exists "exercise_logs_insert_own" on fitness.fitness_exercise_logs;
drop policy if exists "exercise_logs_insert_own" on fitness.fitness_exercise_logs;
create policy "fitness_exercise_logs_insert_own" on fitness.fitness_exercise_logs for insert
  with check ((select auth.uid()) = user_id and private.has_app_access('fitness'));

drop policy if exists "exercise_logs_update_own" on fitness.fitness_exercise_logs;
drop policy if exists "fitness_exercise_logs_update_own" on fitness.fitness_exercise_logs;
create policy "fitness_exercise_logs_update_own" on fitness.fitness_exercise_logs for update
  using ((select auth.uid()) = user_id and private.has_app_access('fitness'))
  with check ((select auth.uid()) = user_id and private.has_app_access('fitness'));

drop policy if exists "exercise_logs_delete_own" on fitness.fitness_exercise_logs;
drop policy if exists "fitness_exercise_logs_delete_own" on fitness.fitness_exercise_logs;
create policy "fitness_exercise_logs_delete_own" on fitness.fitness_exercise_logs for delete
  using ((select auth.uid()) = user_id and private.has_app_access('fitness'));
