-- F5-06.4: kenos_list_plan_activity reads
--   where user_id = auth.uid() [and created_at < p_before] order by created_at desc, id desc limit N
-- Only pkey(id) + correlation_id indexes existed, so the read did a bitmap heap
-- scan of ALL of a user's activity rows + top-N heapsort. This covering index
-- serves the filter + ordering directly (index-only-ish, no full-user scan).
create index if not exists kenos_plan_activity_user_created_idx
  on public.kenos_plan_activity (user_id, created_at desc, id desc);
