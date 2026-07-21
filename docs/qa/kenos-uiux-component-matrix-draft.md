# Component keep / remove matrix (draft — finalize after direction decision)

Criteria: mature look · correct hierarchy · helps content · platform-expected · long-term reuse.  
“Exists / tested / widely used” is **not** a KEEP reason.

| Component | Draft rating | Why |
|---|---|---|
| LifeOsSheet | **KEEP** (RESTYLE inner) | Correct transient container for Switcher; restyle body away from stacked marketing cards. |
| BottomNav | **RESTRUCTURE** | Floating glass OK; must not cover content; Space Switcher must not compete as FAB/5th tab. |
| AppShell (aios layout chrome) | **RESTRUCTURE** | Primary cheap source: competing chrome, sparse content, platform mismatch. |
| systemNav | **RESTYLE** | Keep IA (Today/Assistant/Inbox/…); restyle labels/icons density. |
| Card (generic raised) | **REMOVE** from system lists | Card overuse drives cheap admin look; domain apps may keep own cards. |
| PageHeader | **RESTYLE** | Display title OK if paired with real type ramp + tighter top rhythm. |
| SectionHeader | **RESTYLE** | Need section vs list-title distinction (weight/tracking, not size alone). |
| StateNotice | **KEEP** | Required for loading/empty/error/unavailable; restyle tone (warning≠critical). |
| Toolbar | **REPLACE_WITH_NATIVE** where possible | Prefer system toolbar clusters; custom quiet-buttons only as fallback. |
| SpaceSwitcher | **RESTRUCTURE** | Behavior keep (recent/pinned/resume); visual → sheet + hairline groups + clear current; absorb Continue/selection from V3. |
| FAB (Space Switch) | **REMOVE** | Competes with tab; not native; entry via toolbar/sidebar/long-press. |
| Domain tiles | **DOMAIN_ONLY / REMOVE from Kenos lists** | Prefer list rows with domain accent underline/token, not tile grid. |
| Empty state | **RESTYLE** | Keep component; reduce illustration noise; actionable primary. |
| Approval row | **RESTRUCTURE** | Human summary primary; executor ids/metadata demoted. |
| Today cards | **RESTRUCTURE** | Hairline content groups, not raised cards. |

Final ratings bind to chosen primary direction after blind review.
