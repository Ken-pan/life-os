# Context Export: Bug Screenshot → Supabase Log MVP

This document exports the relevant codebase context and design roadmap for building a future "Capture bug" MVP in the **LifeOS** monorepo.

---

## 1. Repo/App Structure

### Technology Stack
* **Framework**: SvelteKit + Vite (v5/v4) configured as a monorepo using **npm workspaces** and **Turbo**.
* **Styling**: Vanilla CSS with shared design tokens exported from `packages/theme`.

### Relevant Folders & Files
```
├── apps/
│   ├── portal/                      # Launcher app (portal.kenos.space)
│   │   └── src/lib/supabase.js      # Portal Supabase client
│   ├── planner/                     # Production Planner OS
│   │   ├── src/lib/supabase.js      # Supabase client wrapper
│   │   ├── src/lib/ui.svelte.js     # Modal/Sheet and Editor UI state stores
│   │   └── src/routes/              # Planner SvelteKit routes (+layout.svelte)
│   ├── fitness/                     # Production Fitness OS
│   │   └── src/lib/supabase.js      # Fitness Supabase client
│   ├── music/                       # Production Music OS
│   │   └── src/lib/cloudAudio.js    # Ref. implementation for Storage uploads
│   └── home/                        # Experimental Home OS
├── packages/
│   ├── platform-web/                # Shared components/helpers
│   │   └── src/svelte/toast/        # Shared Svelte toast store & components
│   ├── theme/                       # Design system, CSS variables & global UI state
│   └── sync/                        # Shared DB synchronization utilities
│       ├── src/supabaseClient.js    # Shared client factory (createLifeOsSupabaseClient)
│       └── src/supabaseEnv.js       # Environment configuration resolvers
└── supabase/
    └── .temp/                       # Shared local supabase metadata/temp files
```

### Architecture Notes
* Shared packages like `@life-os/platform-web` and `@life-os/sync` are imported across the four production apps via workspaces.
* Svelte 5 runes (`$state`, `$derived`, `$effect`) are utilized across newer modules and store implementations (e.g. `packages/platform-web/src/svelte/toast/store.svelte.js`).

---

## 2. Supabase Integration Context

### Client Creation
The Supabase client is initialized uniformly in each app (e.g. [supabaseClient.js](file:///Users/kenpan/「Projects」/life-os/packages/sync/src/supabaseClient.js)) by calling `createLifeOsSupabaseClient` with context-appropriate fallbacks:
```javascript
export const { supabase } = createLifeOsSupabaseClient(createClient, { env: import.meta.env })
```
It supports cross-domain Single Sign-On (SSO) via [sso.js](file:///Users/kenpan/「Projects」/life-os/packages/sync/src/sso.js) storing access/refresh tokens in a top-level cookie (`.kenos.space`).

### Auth User / Session Access
Each app accesses the authenticated session asynchronously or via its respective auth store. For instance:
* `await supabase.auth.getUser()`
* `await supabase.auth.getSession()`
* Svelte auth store: `apps/planner/src/lib/auth.svelte.js` containing `auth.user`.

### Database & Storage Operations
* **Database Calls**: Made directly using standard Supabase JS client format (e.g. `supabase.from(table).upsert()`).
* **Storage Bucket Pattern**: Found in `apps/music/src/lib/cloudAudio.js` under two buckets: `music` (private, accessed via temporary signed URLs) and `music-covers` (public, accessed via public URLs).
* **Storage upload pattern**: Uses simple binary upload for small files and TUS-based chunked uploads (`tus-js-client`) for files above `6MB`.
```javascript
// Simple upload pattern from cloudAudio.js
const { error } = await supabase.storage.from(bucketName).upload(path, blob, {
  cacheControl: '31536000',
  upsert: true,
  contentType
})
```

### Migration Locations
Each application manages its own schema updates inside its workspace directory:
* `apps/planner/supabase/migrations/`
* `apps/fitness/supabase/migrations/`
* `apps/music/supabase/migrations/`
* `apps/finance/supabase/migrations/`

### Table and RLS Conventions
* **Naming Conventions**: Low-case snake case prefixed with the application name (e.g., `planner_tasks`, `planner_lists`).
* **RLS Pattern**: Restricts all CRUD operations to `auth.uid() = user_id`.
```sql
alter table public.planner_tasks enable row level security;
create policy "planner_tasks_select_own" on public.planner_tasks for select using ((select auth.uid()) = user_id);
```

---

## 3. Existing Logging, Error & Debug Context

* **Toast System**: Svelte toast notifications are built on top of `@life-os/platform-web/svelte/toast-store` (instantiated in each app's `ui.svelte.js` under `toastState` and `toast()`). Tones available: `'success'`, `'error'`, `'warn'`.
* **Global Error Handlers**: There is no dedicated Sentry, PostHog, or centralized client-side logger initialized. Unhandled promise rejections and `window.onerror` are currently left to standard browser behavior.
* **Sync Error Banner**: Shared banners exist (`SyncErrorBanner.svelte` in `packages/platform-web`) to alert the user of offline/failed sync transitions.
* **Gaps for Bug Capture**: No database-backed log recording exists. All errors caught in async code blocks are typically handled with visual toast notifications or silent console prints.

---

## 4. Screenshot / File Upload Context

* **Existing Attachment Handling**: File selection is supported via Svelte bindings (e.g. `<input type="file" />`) and custom wrappers like `SettingsFileButton.svelte`.
* **Clipboard & Drag/Drop**: Drag-and-drop handles task scheduling, but there are no image paste handlers or clipboard drag-and-drop utilities.
* **Screenshot Capability**: Currently, there is **no** canvas-based HTML screenshot capture library (`html2canvas` / `dom-to-image`) or native viewport capture inside the repo.
* **Least-Invasive MVP Path**:
  1. Rely on a manual image selection dialog or clipboard paste interceptor.
  2. Implement an optional toggle for `navigator.mediaDevices.getDisplayMedia` to grab a native screen frame if supported, falling back gracefully to manual image attachment.
  3. No silent screenshot captures to preserve security.

---

## 5. UI Integration Points

Three options exist for integrating the "Capture Bug" entry point:
1. **Shared Portal Settings**: Adding a feedback/bug reporter in `apps/portal` to handle global app diagnostics.
2. **App Header/AppBar**: Adding a small bug icon inside `AppBar.svelte` (e.g. `apps/planner/src/lib/components/AppBar.svelte`) for quick trigger access on active screens.
3. **App Settings Page (Recommended MVP)**:
   * **Where**: Inside the common Settings view (e.g. `apps/planner/src/routes/settings/+page.svelte` or `apps/fitness/src/routes/settings/+page.svelte`).
   * **Why**: Safest placement that avoids polluting main task and calendar interfaces, honors mobile/PWA constraints, and places the diagnostic tools directly next to Cloud Sync status controls.
   * **Reusable UI**: Use the shared `Toast` component and standard Svelte dialog sheets.

---

## 6. Proposed Minimal Data Model

### Database Table: `public.bug_logs`
```sql
create table if not exists public.bug_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  app text not null,                          -- 'planner' | 'fitness' | 'finance' | 'music' | 'portal'
  route text not null,                        -- e.g. '/settings', '/calendar'
  title text not null,
  notes text,
  screenshot_path text,                       -- Storage folder path: user_id/bugs/uuid.png
  severity text not null default 'medium',    -- 'low' | 'medium' | 'high'
  status text not null default 'open',        -- 'open' | 'fixed' | 'ignored'
  user_agent text,
  viewport_width int,
  viewport_height int,
  device_pixel_ratio numeric,
  console_summary text,                       -- Truncated list of captured console output
  error_message text,
  error_stack text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS Configuration
alter table public.bug_logs enable row level security;

create policy "bug_logs_select_own" on public.bug_logs 
  for select using ((select auth.uid()) = user_id);

create policy "bug_logs_insert_own" on public.bug_logs 
  for insert with check ((select auth.uid()) = user_id);

create policy "bug_logs_update_own" on public.bug_logs 
  for update using ((select auth.uid()) = user_id);

-- Indexes
create index if not exists bug_logs_user_created_idx on public.bug_logs (user_id, created_at desc);
```

### Storage Bucket Configuration
* **Bucket Name**: `bug-attachments` (Private bucket).
* **Storage Path Pattern**: `user_id/bugs/{bug_log_uuid}.png`.
* **RLS Plain English Intent**: Only authenticated owners can upload files to their matching `user_id/` prefix and generate signed URLs to view them.

---

## 7. MVP Implementation Recommendation

The MVP should focus on a simple form that uploads a user-provided screenshot and writes diagnostic metadata to the database.

### Phase 1: Database & Storage setup
1. Create a migration file in Svelte app's local directory (e.g. `apps/planner/supabase/migrations/`) representing `public.bug_logs`.
2. Configure the `bug-attachments` private storage bucket. Define RLS policies enforcing `auth.uid() = user_id` for path prefixes.

### Phase 2: Diagnostic Context Extractor (`packages/platform-web`)
1. Create a helper utility in `packages/platform-web/src/diagnostics.js` that compiles:
   * Current path: `window.location.pathname` + `window.location.search`.
   * Viewport details: `window.innerWidth`, `window.innerHeight`, `window.devicePixelRatio`.
   * Client context: `navigator.userAgent`.
2. Introduce a temporary listener helper to capture recent `console.error` outputs (capped at 5 items) for dump generation.

### Phase 3: Svelte Bug Reporter Dialog Component
1. Create a reusable component `BugReporterSheet.svelte` in `packages/platform-web/src/svelte/feedback/`.
2. Incorporate a file selector for screenshot uploads, support clipboard paste events on document focus, and collect user notes.
3. Submit action details:
   * First, upload the image to Supabase Storage if present to get the storage path.
   * Write the record to `bug_logs` (handling transactional rollbacks if db write fails).

### Phase 4: Wire UI Trigger
1. Add a button "Report a Bug" in the App Settings view.
2. Link trigger to show the `BugReporterSheet`.
3. Provide a confirmation Toast upon success.

---

## 8. Risk Checklist

* **PWA & Mobile Safari Limitations**: `getDisplayMedia` may fail, be blocked, or lack prompt-less context in stand-alone iOS PWAs. Fallback to file picker / copy-paste is essential.
* **Sensitive Data Redaction**: Automatic console logging captures or form inputs might leak auth tokens (like cookies or local session keys). The client extractor must proactively sanitize credentials.
* **Storage Leaks**: If the database insert fails after an image upload, orphan files will remain in Storage. Implement error handlers to delete the uploaded object if the database record creation fails.
* **Network Offline State**: If the user encounters a bug due to offline state, local sync storage or localStorage queue backup should be designed for future iterations. For MVP, alert the user using the Toast system that submission requires connectivity.

---

## 9. Final Output Summary

### Recommended MVP
A manual "Report a Bug" trigger situated in the app Settings screen. It opens a modal capturing viewport dimensions, user agent details, user-written notes, and an optional image attachment upload via standard file chooser or Clipboard copy-paste.

### Files Likely to Change
| File | Why | Risk |
| :--- | :--- | :--- |
| `apps/planner/supabase/migrations/<timestamp>_bug_logs.sql` | Schema creation for database log records. | None (adds table). |
| `packages/platform-web/src/diagnostics.js` [NEW] | Diagnostic context compiler (screen width, console output, user-agent). | High console noise if not capped. |
| `packages/platform-web/src/svelte/feedback/BugReporterSheet.svelte` [NEW] | Reusable Svelte sheet collecting note inputs & upload handling. | Complex drag/paste hooks on mobile. |
| `apps/planner/src/routes/settings/+page.svelte` | Adding entry hook in Settings section. | Low (isolated component trigger). |

### Open Questions
* **Single vs Multi-App Tables**: Should we store bug logs in a single unified table `bug_logs` (shared across monorepo apps) or app-specific tables? *Recommendation: Single shared table in the shared database schema.*
* **Console Hijacking**: Should we override standard console prototypes? *Recommendation: Avoid global overrides to prevent side effects in normal runtime.*

### Commands Run
* `list_dir /Users/kenpan/「Projects」/life-os`
* `list_dir /Users/kenpan/「Projects」/life-os/apps`
* `list_dir /Users/kenpan/「Projects」/life-os/packages`
* `list_dir /Users/kenpan/「Projects」/life-os/apps/planner`
* `grep_search createClient`
* `view_file packages/sync/src/supabaseClient.js`
* `view_file packages/sync/src/supabaseEnv.js`
* `view_file packages/sync/src/constants.js`
* `view_file packages/sync/src/sso.js`
* `grep_search CREATE TABLE`
* `view_file apps/planner/supabase/migrations/20260705130000_planner_core_schema.sql`
* `view_file apps/planner/supabase/migrations/20260705140000_planner_structured_tables.sql`
* `grep_search .storage`
* `grep_search bucket`
* `view_file apps/music/src/lib/cloudAudio.js` (lines 430-480)
* `grep_search toast`
* `list_dir packages/platform-web`
* `list_dir packages/platform-web/src`
* `list_dir packages/platform-web/src/svelte`
* `list_dir packages/platform-web/src/svelte/toast`
* `view_file packages/platform-web/src/svelte/toast/store.svelte.js`
* `grep_search createToastStore` (js files)
* `view_file apps/planner/src/lib/ui.svelte.js`
* `grep_search unhandledrejection`
* `grep_search onerror`
* `list_dir packages/theme`
* `list_dir packages/theme/src`
* `view_file packages/theme/src/index.js`
* `grep_search type="file"`
* `list_dir apps/planner/src/routes`
* `view_file apps/planner/src/routes/+layout.svelte`
* `view_file apps/planner/src/routes/settings/+page.svelte`
* `grep_search /debug`
* `view_file packages/platform-web/src/index.js`
* `view_file packages/platform-web/src/svelte/toast/Toast.svelte`

### Confidence
**High**: The audit was non-destructive and thoroughly examined all layers of initialization, theme management, existing Svelte pages/layouts, package sync configurations, and error banners in the monorepo.
