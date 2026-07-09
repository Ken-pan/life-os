-- ============================================================================
-- PR-3B Migration: Add paper_device_actions table for idempotency tracking
-- ============================================================================
-- Table for logging device actions and tracking idempotency.
-- Device submissions with same (user_id, device_id, client_action_id) return
-- prior result instead of being re-executed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS paper_device_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity: who did this action and from which device
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,

  -- Batch and action identifiers (for deduplication)
  client_batch_id TEXT NOT NULL,
  client_action_id TEXT NOT NULL,

  -- Action details
  action_type TEXT NOT NULL,           -- e.g., 'task.complete'
  target_task_id TEXT NULL,            -- task ID being mutated (NULL for task.create)
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,  -- full action payload for audit
  base_version BIGINT NULL,            -- device's task.updatedAt (stale detection)

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'received',  -- received, applied, conflict, rejected, failed
  result JSONB NULL,                   -- outcome if applied/duplicate (e.g., {taskId, completedAt})
  conflict JSONB NULL,                 -- conflict details if status='conflict'

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ NULL,

  -- Idempotency constraint: same device + user + action ID = one outcome
  UNIQUE (user_id, device_id, client_action_id)
);

-- Index for fast idempotency lookups (check if action already processed)
CREATE INDEX paper_device_actions_idempotency_idx
  ON paper_device_actions(user_id, client_action_id, status);

-- Index for batch lookups and audit trails
CREATE INDEX paper_device_actions_batch_idx
  ON paper_device_actions(user_id, device_id, client_batch_id, created_at DESC);

-- Index for time-based queries (e.g., last 24 hours)
CREATE INDEX paper_device_actions_timeline_idx
  ON paper_device_actions(user_id, created_at DESC);

-- Enable Row-Level Security
ALTER TABLE paper_device_actions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own actions (for browser clients via Supabase JS client)
CREATE POLICY paper_device_actions_user_read ON paper_device_actions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role (Netlify Functions) can insert/update
-- Note: Service role bypasses RLS, so this policy is mainly for audit.
-- The application layer (Netlify function) validates device token before insert.
-- No update policy needed for PR-3B (actions are created, not updated in real-time).
CREATE POLICY paper_device_actions_service_insert ON paper_device_actions
  FOR INSERT
  WITH CHECK (TRUE);

-- ============================================================================
-- End of migration
-- ============================================================================
