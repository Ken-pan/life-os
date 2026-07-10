import { createClient } from '@supabase/supabase-js';
import { readSupabaseUrl, readSupabaseServiceRoleKey, readEnv } from './pushEnv.mjs';

/**
 * Initialize Supabase Client.
 */
export function getSupabaseClient() {
  const url = readSupabaseUrl();
  const key = readSupabaseServiceRoleKey() || readEnv('PUBLIC_SUPABASE_ANON_KEY') || readEnv('VITE_SUPABASE_ANON_KEY');
  if (!url || !key) {
    throw new Error('Supabase URL or Key is not configured.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Load PaperOS task rows through the normal service-role path, or through a
 * token-guarded database RPC when Netlify env cannot expose service role.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<{ statePayload: object|null, taskRows: Array<{id:string,data:object}> }>}
 */
async function loadPaperSnapshotRows(supabase, userId) {
  if (!readSupabaseServiceRoleKey()) {
    const deviceToken = readEnv('PAPER_DEVICE_TOKEN');
    if (!deviceToken) {
      throw new Error('PAPER_DEVICE_TOKEN is missing.');
    }

    const { data, error } = await supabase.rpc('paper_device_snapshot', {
      p_token: deviceToken,
      p_user_id: userId
    });
    if (error) throw error;

    return {
      statePayload: data?.state_payload || null,
      taskRows: data?.tasks || []
    };
  }

  const [{ data: stateRow }, { data: taskRows, error }] = await Promise.all([
    supabase
      .from('planner_user_state')
      .select('payload')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('planner_tasks')
      .select('id, data')
      .eq('user_id', userId)
  ]);

  if (error) throw error;
  return {
    statePayload: stateRow?.payload || null,
    taskRows: taskRows || []
  };
}

/**
 * Verifies the incoming Bearer token.
 * @param {Request} req
 * @returns {boolean}
 */
export function verifyPaperToken(req) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.substring(7).trim();
  const validToken = readEnv('PAPER_DEVICE_TOKEN');
  return validToken && token === validToken;
}

/**
 * Default task duration in minutes.
 * @param {object} task
 * @returns {number}
 */
export function defaultDurationMinutes(task) {
  const kind = task.meta?.kind;
  if (kind === 'focus') return 60;
  if (kind === 'habit') return 30;
  if (kind === 'micro') return 15;
  return 30;
}

/**
 * Convert HH:mm to minutes from midnight.
 * @param {string} time
 * @returns {number}
 */
function parseTimeToMinutes(time) {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Load today agenda and tasks for the device.
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function loadPaperToday(userId) {
  const supabase = getSupabaseClient();

  const { statePayload, taskRows } = await loadPaperSnapshotRows(supabase, userId);

  const settings = statePayload?.settings || {};
  const tz = settings.timezone || 'America/Los_Angeles';
  const locale = settings.locale || 'zh-CN';

  const allTasks = (taskRows || []).map((row) => ({ id: row.id, ...row.data }));

  // 3. Compute local date and time
  const now = new Date();
  const formatterDate = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const partsDate = formatterDate.formatToParts(now);
  const year = partsDate.find(p => p.type === 'year').value;
  const month = partsDate.find(p => p.type === 'month').value;
  const day = partsDate.find(p => p.type === 'day').value;
  const todayStr = `${year}-${month}-${day}`;

  const formatterTime = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const partsTime = formatterTime.formatToParts(now);
  let hour = partsTime.find(p => p.type === 'hour').value;
  if (hour === '24') hour = '00';
  const minute = partsTime.find(p => p.type === 'minute').value;
  const timeStr = `${hour}:${minute}`;
  const currentMinutes = parseInt(hour, 10) * 60 + parseInt(minute, 10);

  // 4. Filtering and selection
  // Filter for today schedule blocks
  const scheduledToday = allTasks.filter(t => !t.deletedAt && t.scheduledDate === todayStr && t.scheduledStart);

  // Build scheduleBlocks
  const scheduleBlocks = scheduledToday.map(t => {
    const duration = t.durationMinutes || defaultDurationMinutes(t);
    return {
      id: t.id,
      title: t.title,
      start: t.scheduledStart,
      durationMinutes: duration,
      completed: Boolean(t.completed)
    };
  }).sort((a, b) => a.start.localeCompare(b.start));

  // Determine tasks selection for "today view" (Limit 30)
  const todayTasks = allTasks.filter(t => {
    if (t.deletedAt) return false;
    if (t.completed) return false;
    return (
      t.scheduledDate === todayStr ||
      t.dueDate === todayStr ||
      t.priority === 'P0' ||
      t.priority === 'P1' ||
      t.listId === 'inbox'
    );
  });

  // Sort: priority first, then scheduledStart, then updatedAt
  const priorityOrder = { 'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3 };
  todayTasks.sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 3;
    const pb = priorityOrder[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    if (a.scheduledStart && b.scheduledStart) return a.scheduledStart.localeCompare(b.scheduledStart);
    if (a.scheduledStart) return -1;
    if (b.scheduledStart) return 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  const slicedTasks = todayTasks.slice(0, 30).map(t => ({
    id: t.id,
    title: t.title,
    notes: t.notes || '',
    priority: t.priority || 'P3',
    dueDate: t.dueDate || null,
    completed: Boolean(t.completed),
    updatedAt: Number(t.updatedAt || t.createdAt || now.getTime())
  }));

  // Determine currentFocus
  let currentFocus = null;

  // Rule 1: Task scheduled for current local window
  const activeBlock = scheduledToday.find(t => {
    if (t.completed) return false;
    const startMins = parseTimeToMinutes(t.scheduledStart);
    const duration = t.durationMinutes || defaultDurationMinutes(t);
    return currentMinutes >= startMins && currentMinutes < startMins + duration;
  });

  if (activeBlock) {
    currentFocus = activeBlock;
  } else {
    // Rule 2: Highest priority incomplete scheduled task for today
    const scheduledIncomplete = scheduledToday
      .filter(t => !t.completed)
      .sort((a, b) => {
        const pa = priorityOrder[a.priority] ?? 3;
        const pb = priorityOrder[b.priority] ?? 3;
        return pa - pb || a.scheduledStart.localeCompare(b.scheduledStart);
      });
    if (scheduledIncomplete.length > 0) {
      currentFocus = scheduledIncomplete[0];
    } else {
      // Rule 3: Highest priority incomplete task due today
      const dueTodayIncomplete = allTasks
        .filter(t => !t.deletedAt && !t.completed && t.dueDate === todayStr)
        .sort((a, b) => {
          const pa = priorityOrder[a.priority] ?? 3;
          const pb = priorityOrder[b.priority] ?? 3;
          return pa - pb;
        });
      if (dueTodayIncomplete.length > 0) {
        currentFocus = dueTodayIncomplete[0];
      }
    }
  }

  // Format focus return shape
  const focusResponse = currentFocus ? {
    id: currentFocus.id,
    title: currentFocus.title,
    notes: currentFocus.notes || '',
    priority: currentFocus.priority || 'P3'
  } : {};

  // Compute cursor: max(updatedAt)
  const maxUpdatedAt = allTasks.reduce((max, t) => Math.max(max, t.updatedAt || 0), 0);
  const cursor = String(maxUpdatedAt || now.getTime());

  // Count inbox
  const inboxCount = allTasks.filter(t => !t.deletedAt && !t.completed && t.listId === 'inbox').length;

  return {
    serverTime: now.toISOString(),
    cursor,
    user: {
      id: userId,
      name: settings.userName || 'Life OS User',
      locale,
      timezone: tz
    },
    today: {
      date: todayStr,
      currentFocus: focusResponse,
      scheduleBlocks
    },
    tasks: slicedTasks,
    inbox: {
      count: inboxCount
    },
    devicePolicy: {
      activePollSeconds: 300,
      idlePollSeconds: 900,
      heartbeatSeconds: 900
    }
  };
}

/**
 * Load delta updates since cursor.
 * @param {string} userId
 * @param {number} cursorMs
 * @returns {Promise<object>}
 */
export async function loadPaperDelta(userId, cursorMs) {
  const supabase = getSupabaseClient();
  const { taskRows } = await loadPaperSnapshotRows(supabase, userId);

  const allTasks = (taskRows || []).map((row) => ({ id: row.id, ...row.data }));
  const updatedTasks = allTasks.filter(t => (t.updatedAt || t.createdAt || 0) > cursorMs);

  const upserted = updatedTasks.filter(t => !t.deletedAt).map(t => ({
    id: t.id,
    title: t.title,
    notes: t.notes || '',
    priority: t.priority || 'P3',
    dueDate: t.dueDate || null,
    completed: Boolean(t.completed),
    updatedAt: Number(t.updatedAt || t.createdAt || Date.now())
  }));

  const deleted = updatedTasks.filter(t => t.deletedAt).map(t => t.id);

  const maxUpdatedAt = allTasks.reduce((max, t) => Math.max(max, t.updatedAt || 0), 0);
  const nextCursor = String(maxUpdatedAt || Date.now());

  return {
    cursor: nextCursor,
    hasMore: false,
    changes: {
      upserted,
      deleted
    }
  };
}

/**
 * Performs action validations and dry-run reporting.
 * @param {string} userId
 * @param {object} batch
 * @returns {Promise<object>}
 */
export async function dryRunActions(userId, batch) {
  const actions = batch.actions || [];
  const applied = [];
  const proposedMutations = [];

  for (const action of actions) {
    if (!action.clientActionId) {
      throw new Error('Every action must contain a clientActionId.');
    }
    applied.push(action.clientActionId);
    proposedMutations.push({
      clientActionId: action.clientActionId,
      type: action.type,
      taskId: action.taskId || null,
      proposedChange: {
        completed: action.type === 'task.complete' ? true : undefined,
        dueDate: action.type === 'task.snooze' ? 'snoozed' : (action.type === 'task.moveTomorrow' ? 'tomorrow' : undefined),
        createdTitle: action.type === 'task.create' ? action.title : undefined
      }
    });
  }

  return {
    batchStatus: 'dry_run',
    dryRun: true,
    applied,
    conflicts: [],
    proposedMutations,
    newCursor: String(Date.now())
  };
}

/**
 * Handles existing action log entries by status.
 * Implements received-state recovery for resumability.
 * @private
 */
async function handleExistingActionLog(supabase, userId, batch, action, existingAction) {
  const duplicates = [];
  const conflicts = [];
  const rejected = [];
  const failed = [];

  switch (existingAction.status) {
    case 'applied':
      // Action already applied; return prior result
      duplicates.push({
        clientActionId: action.clientActionId,
        status: 'duplicate',
        priorStatus: 'applied',
        priorResult: existingAction.result,
        appliedAt: existingAction.applied_at
      });
      break;

    case 'duplicate':
      // Rare: log entry itself is marked duplicate (shouldn't happen)
      duplicates.push({
        clientActionId: action.clientActionId,
        status: 'duplicate',
        priorStatus: 'duplicate',
        priorResult: existingAction.result,
        appliedAt: existingAction.applied_at
      });
      break;

    case 'conflict':
      // Action encountered conflict before; return prior conflict
      conflicts.push({
        clientActionId: action.clientActionId,
        status: 'conflict',
        reason: existingAction.conflict?.reason || 'unknown',
        details: existingAction.conflict
      });
      break;

    case 'rejected':
      // Action failed validation; return prior rejection
      rejected.push({
        clientActionId: action.clientActionId,
        status: 'rejected',
        reason: existingAction.result?.reason || 'validation_error',
        message: existingAction.result?.message
      });
      break;

    case 'failed':
      // Action had transient error; return as failed
      failed.push({
        clientActionId: action.clientActionId,
        status: 'failed',
        reason: existingAction.result?.reason || 'transient_error',
        message: existingAction.result?.message
      });
      break;

    case 'received':
      // Log was inserted but mutation may have succeeded.
      // Reconcile: check if task was actually completed.
      const { data: taskRows } = await supabase
        .from('planner_tasks')
        .select('id, data')
        .eq('user_id', userId)
        .eq('id', action.taskId)
        .maybeSingle();

      if (!taskRows) {
        // Task missing; mark log as rejected/conflict
        await supabase
          .from('paper_device_actions')
          .update({
            status: 'conflict',
            conflict: { reason: 'task_missing_during_recovery' }
          })
          .eq('id', existingAction.id)
;

        conflicts.push({
          clientActionId: action.clientActionId,
          status: 'conflict',
          reason: 'task_missing_during_recovery',
          details: { logId: existingAction.id, recovered: true }
        });
      } else {
        const task = { id: taskRows.id, ...taskRows.data };

        if (task.completed) {
          // Task is completed; this action succeeded before.
          // Update log to applied and mark as recovered.
          const now = new Date();
          await supabase
            .from('paper_device_actions')
            .update({
              status: 'applied',
              result: {
                taskId: task.id,
                completedAt: task.completedAt,
                updatedAt: task.updatedAt,
                recovered: true
              },
              applied_at: now
            })
            .eq('id', existingAction.id)
  ;

          duplicates.push({
            clientActionId: action.clientActionId,
            status: 'duplicate',
            priorStatus: 'received (recovered)',
            priorResult: {
              taskId: task.id,
              completedAt: task.completedAt,
              updatedAt: task.updatedAt,
              recovered: true
            },
            appliedAt: now
          });
        } else {
          // Task not completed yet. Continue with task.complete.
          // Log is already inserted with status='received'.
          // This path is NOT returned; falls through to continue normal flow.
          return { shouldContinue: true, existingLogId: existingAction.id };
        }
      }
      break;

    default:
      // Unknown status; treat as failed
      failed.push({
        clientActionId: action.clientActionId,
        status: 'failed',
        reason: 'unknown_log_status',
        message: `Log entry has unknown status: ${existingAction.status}`
      });
  }

  return { duplicates, conflicts, rejected, failed };
}

/**
 * Applies actions to PlannerOS with idempotency tracking (log-first pattern).
 * Supports task.complete only in PR-3B.
 * Rejects unsupported action types.
 * @param {string} userId
 * @param {object} batch
 * @returns {Promise<object>}
 */
export async function applyActions(userId, batch) {
  const supabase = getSupabaseClient();
  const actions = batch.actions || [];
  const applied = [];
  const duplicates = [];
  const conflicts = [];
  const rejected = [];
  const failed = [];
  const now = new Date();

  for (const action of actions) {
    if (!action.clientActionId) {
      rejected.push({
        clientActionId: null,
        status: 'rejected',
        reason: 'missing_client_action_id',
        message: 'Every action must contain a clientActionId.'
      });
      continue;
    }

    // Check if this action type is supported in PR-3B
    if (action.type !== 'task.complete') {
      rejected.push({
        clientActionId: action.clientActionId,
        status: 'rejected',
        reason: 'unsupported_action_type',
        message: `Action type '${action.type}' is not yet supported. Only 'task.complete' is available in PR-3B.`
      });
      continue;
    }

    if (!action.taskId) {
      rejected.push({
        clientActionId: action.clientActionId,
        status: 'rejected',
        reason: 'missing_task_id',
        message: 'task.complete requires a taskId.'
      });
      continue;
    }

    // Check for existing action log entry
    const { data: existingAction, error: queryError } = await supabase
      .from('paper_device_actions')
      .select('*')
      .eq('user_id', userId)
      .eq('device_id', batch.deviceId || 'unknown')
      .eq('client_action_id', action.clientActionId)
      .maybeSingle();

    if (queryError) {
      failed.push({
        clientActionId: action.clientActionId,
        status: 'failed',
        reason: 'query_error',
        message: queryError.message
      });
      continue;
    }

    // Handle existing log entry by status
    if (existingAction) {
      const result = await handleExistingActionLog(supabase, userId, batch, action, existingAction);

      if (result.shouldContinue) {
        // Received state recovery: task not yet completed, continue with application
        // Fall through to task completion logic below (skip log insert, use existing log ID)
      } else {
        // Other statuses: return results and continue to next action
        duplicates.push(...result.duplicates);
        conflicts.push(...result.conflicts);
        rejected.push(...result.rejected);
        failed.push(...result.failed);
        continue;
      }
    }

    // Determine if we're continuing from received state or starting fresh
    let existingLogId = null;
    let isRecovery = false;

    if (existingAction && existingAction.status === 'received') {
      existingLogId = existingAction.id;
      isRecovery = true;
    }

    // Fetch target task
    const { data: taskRows, error: taskQueryError } = await supabase
      .from('planner_tasks')
      .select('id, data')
      .eq('user_id', userId)
      .eq('id', action.taskId)
      .maybeSingle();

    if (taskQueryError) {
      // Log entry with error (insert if new, update if recovery)
      if (isRecovery) {
        await supabase
          .from('paper_device_actions')
          .update({
            status: 'rejected',
            result: { reason: 'task_query_error', message: taskQueryError.message }
          })
          .eq('id', existingLogId)
;
      } else {
        await supabase.from('paper_device_actions').insert({
          user_id: userId,
          device_id: batch.deviceId || 'unknown',
          client_batch_id: batch.clientBatchId || '',
          client_action_id: action.clientActionId,
          action_type: action.type,
          target_task_id: action.taskId,
          payload: action,
          base_version: action.baseVersion || null,
          status: 'rejected',
          result: { reason: 'task_query_error', message: taskQueryError.message },
          created_at: now
        });
      }

      rejected.push({
        clientActionId: action.clientActionId,
        status: 'rejected',
        reason: 'task_query_error',
        message: taskQueryError.message
      });
      continue;
    }

    if (!taskRows) {
      // Task not found
      if (isRecovery) {
        await supabase
          .from('paper_device_actions')
          .update({
            status: 'rejected',
            result: { reason: 'task_not_found' }
          })
          .eq('id', existingLogId)
;
      } else {
        await supabase.from('paper_device_actions').insert({
          user_id: userId,
          device_id: batch.deviceId || 'unknown',
          client_batch_id: batch.clientBatchId || '',
          client_action_id: action.clientActionId,
          action_type: action.type,
          target_task_id: action.taskId,
          payload: action,
          base_version: action.baseVersion || null,
          status: 'rejected',
          result: { reason: 'task_not_found' },
          created_at: now
        });
      }

      rejected.push({
        clientActionId: action.clientActionId,
        status: 'rejected',
        reason: 'task_not_found',
        message: `Task ${action.taskId} not found.`
      });
      continue;
    }

    const task = { id: taskRows.id, ...taskRows.data };

    // Task deleted check
    if (task.deletedAt) {
      if (isRecovery) {
        await supabase
          .from('paper_device_actions')
          .update({
            status: 'conflict',
            conflict: { reason: 'task_deleted', deletedAt: task.deletedAt }
          })
          .eq('id', existingLogId)
;
      } else {
        await supabase.from('paper_device_actions').insert({
          user_id: userId,
          device_id: batch.deviceId || 'unknown',
          client_batch_id: batch.clientBatchId || '',
          client_action_id: action.clientActionId,
          action_type: action.type,
          target_task_id: action.taskId,
          payload: action,
          base_version: action.baseVersion || null,
          status: 'conflict',
          conflict: { reason: 'task_deleted', deletedAt: task.deletedAt },
          created_at: now
        });
      }

      conflicts.push({
        clientActionId: action.clientActionId,
        status: 'conflict',
        reason: 'task_deleted',
        details: { taskId: action.taskId, deletedAt: task.deletedAt }
      });
      continue;
    }

    // Version check (stale data detection)
    if (action.baseVersion && action.baseVersion < (task.updatedAt || 0)) {
      if (task.completed) {
        // Already completed; stale data with already-completed task (idempotent)
        if (isRecovery) {
          await supabase
            .from('paper_device_actions')
            .update({
              status: 'applied',
              result: {
                taskId: task.id,
                alreadyCompleted: true,
                completedAt: task.completedAt,
                staleVersion: true,
                recovered: true
              },
              applied_at: now
            })
            .eq('id', existingLogId)
  ;
        } else {
          await supabase.from('paper_device_actions').insert({
            user_id: userId,
            device_id: batch.deviceId || 'unknown',
            client_batch_id: batch.clientBatchId || '',
            client_action_id: action.clientActionId,
            action_type: action.type,
            target_task_id: action.taskId,
            payload: action,
            base_version: action.baseVersion || null,
            status: 'applied',
            result: {
              taskId: task.id,
              alreadyCompleted: true,
              completedAt: task.completedAt,
              staleVersion: true
            },
            applied_at: now,
            created_at: now
          });
        }

        applied.push({
          clientActionId: action.clientActionId,
          status: 'applied',
          taskId: task.id,
          alreadyCompleted: true,
          staleVersion: true,
          recovered: isRecovery ? true : undefined
        });
        continue;
      } else {
        // Stale data and task not yet completed (conflict)
        if (isRecovery) {
          await supabase
            .from('paper_device_actions')
            .update({
              status: 'conflict',
              conflict: {
                reason: 'stale_version',
                deviceVersion: action.baseVersion,
                serverVersion: task.updatedAt || 0,
                taskCompleted: false
              }
            })
            .eq('id', existingLogId)
  ;
        } else {
          await supabase.from('paper_device_actions').insert({
            user_id: userId,
            device_id: batch.deviceId || 'unknown',
            client_batch_id: batch.clientBatchId || '',
            client_action_id: action.clientActionId,
            action_type: action.type,
            target_task_id: action.taskId,
            payload: action,
            base_version: action.baseVersion || null,
            status: 'conflict',
            conflict: {
              reason: 'stale_version',
              deviceVersion: action.baseVersion,
              serverVersion: task.updatedAt || 0,
              taskCompleted: false
            },
            created_at: now
          });
        }

        conflicts.push({
          clientActionId: action.clientActionId,
          status: 'conflict',
          reason: 'stale_version',
          details: {
            taskId: action.taskId,
            deviceVersion: action.baseVersion,
            serverVersion: task.updatedAt || 0,
            currentState: { completed: task.completed }
          }
        });
        continue;
      }
    }

    // Check if task already completed (idempotent case)
    if (task.completed) {
      // Task already completed; treat as idempotent success
      // Create/update log entry as 'applied'
      if (isRecovery) {
        // Already have a log entry with status='received', just update to applied
        await supabase
          .from('paper_device_actions')
          .update({
            status: 'applied',
            result: {
              taskId: task.id,
              alreadyCompleted: true,
              completedAt: task.completedAt,
              recovered: true
            },
            applied_at: now
          })
          .eq('id', existingLogId)
;
      } else {
        // Insert new log entry as 'applied'
        await supabase.from('paper_device_actions').insert({
          user_id: userId,
          device_id: batch.deviceId || 'unknown',
          client_batch_id: batch.clientBatchId || '',
          client_action_id: action.clientActionId,
          action_type: action.type,
          target_task_id: action.taskId,
          payload: action,
          base_version: action.baseVersion || null,
          status: 'applied',
          result: {
            taskId: task.id,
            alreadyCompleted: true,
            completedAt: task.completedAt
          },
          applied_at: now,
          created_at: now
        });
      }

      applied.push({
        clientActionId: action.clientActionId,
        status: 'applied',
        taskId: task.id,
        alreadyCompleted: true,
        recovered: isRecovery ? true : undefined
      });
      continue;
    }

    // All checks passed; apply the action (complete the task)
    // LOG-FIRST PATTERN: Insert action log BEFORE mutating task
    const completedAt = now.toISOString();
    const updatedAt = now.getTime();

    // STEP 1: Insert action log with status='received' (if not recovery)
    if (!isRecovery) {
      const { data: insertedLog, error: insertError } = await supabase
        .from('paper_device_actions')
        .insert({
          user_id: userId,
          device_id: batch.deviceId || 'unknown',
          client_batch_id: batch.clientBatchId || '',
          client_action_id: action.clientActionId,
          action_type: action.type,
          target_task_id: action.taskId,
          payload: action,
          base_version: action.baseVersion || null,
          status: 'received',
          created_at: now
        })
        .select('id')
        .single();

      if (insertError) {
        // Check for unique constraint violation (duplicate we missed earlier)
        if (insertError.code === '23505') {
          // Re-query and retry through existing action handler
          const { data: retryAction } = await supabase
            .from('paper_device_actions')
            .select('*')
            .eq('user_id', userId)
            .eq('device_id', batch.deviceId || 'unknown')
            .eq('client_action_id', action.clientActionId)
            .maybeSingle();

          if (retryAction) {
            // Route through existing handler
            const result = await handleExistingActionLog(supabase, userId, batch, action, retryAction);
            duplicates.push(...result.duplicates);
            conflicts.push(...result.conflicts);
            rejected.push(...result.rejected);
            failed.push(...result.failed);
          } else {
            failed.push({
              clientActionId: action.clientActionId,
              status: 'failed',
              reason: 'log_insert_error',
              message: insertError.message
            });
          }
          continue;
        } else {
          failed.push({
            clientActionId: action.clientActionId,
            status: 'failed',
            reason: 'log_insert_error',
            message: insertError.message
          });
          continue;
        }
      }

      existingLogId = insertedLog.id;
    }

    // STEP 2: Update task (log entry now exists as safety record)
    const { error: updateError } = await supabase
      .from('planner_tasks')
      .update({
        data: {
          ...task,
          completed: true,
          completedAt,
          updatedAt
        }
      })
      .eq('user_id', userId)
      .eq('id', action.taskId);

    if (updateError) {
      // Task update failed; leave log as 'received' so retry can reconcile
      await supabase
        .from('paper_device_actions')
        .update({
          status: 'failed',
          result: { reason: 'task_update_error', message: updateError.message }
        })
        .eq('id', existingLogId)
        .catch(() => {}); // Ignore error on log update

      failed.push({
        clientActionId: action.clientActionId,
        status: 'failed',
        reason: 'task_update_error',
        message: updateError.message
      });
      continue;
    }

    // STEP 3: Update log to status='applied' with result
    const { error: updateLogError } = await supabase
      .from('paper_device_actions')
      .update({
        status: 'applied',
        result: {
          taskId: task.id,
          completedAt,
          updatedAt,
          recovered: isRecovery ? true : undefined
        },
        applied_at: now
      })
      .eq('id', existingLogId);

    if (updateLogError) {
      // Log update failed after task mutation. Task IS completed but log shows 'received'.
      // Next retry will see 'received' status and reconcile to 'applied'.
      // This is safe: task is correctly mutated, log state will be fixed on retry.
      applied.push({
        clientActionId: action.clientActionId,
        status: 'applied',
        taskId: task.id,
        completedAt,
        updatedAt,
        logUpdateError: true,
        note: 'Task completed but log transition may not have persisted; retry will reconcile'
      });
    } else {
      applied.push({
        clientActionId: action.clientActionId,
        status: 'applied',
        taskId: task.id,
        completedAt,
        updatedAt,
        recovered: isRecovery ? true : undefined
      });
    }
  }

  // Determine overall batch status
  let batchStatus = 'applied';
  if (applied.length === 0 && duplicates.length === 0 && conflicts.length === 0 && rejected.length === 0 && failed.length === 0) {
    batchStatus = 'applied'; // Empty batch
  } else if (rejected.length > 0 || failed.length > 0) {
    if (applied.length > 0 || duplicates.length > 0 || conflicts.length > 0) {
      batchStatus = 'partially_applied';
    } else {
      batchStatus = 'rejected';
    }
  } else if (conflicts.length > 0) {
    if (applied.length > 0 || duplicates.length > 0) {
      batchStatus = 'partially_applied';
    } else {
      batchStatus = 'conflict';
    }
  }

  // Compute new cursor: max(updatedAt) from applied tasks
  const maxUpdatedAt = applied.reduce((max, a) => {
    const timestamp = a.updatedAt || 0;
    return Math.max(max, timestamp);
  }, 0);
  const newCursor = String(maxUpdatedAt || Date.now());

  return {
    batchStatus,
    dryRun: false,
    applied,
    duplicates,
    conflicts,
    rejected,
    failed: failed.length > 0 ? failed : undefined,
    newCursor
  };
}
