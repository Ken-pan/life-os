export type AppTabId =
  | "today"
  | "overview"
  | "stocks"
  | "history"
  | "review"
  | "forecast"
  | "decision"
  | "settings";

export type ReviewSection =
  | "import"
  | "queue"
  | "baseline"
  | "calibrate"
  | "reconcile";

export type SettingsSection = "accounts" | "assumptions" | "app";

export type AppRoute = {
  tab: AppTabId;
  section?: string;
};

const TABS = new Set<AppTabId>([
  "today",
  "overview",
  "stocks",
  "history",
  "review",
  "forecast",
  "decision",
  "settings",
]);

const SECTIONS: Partial<Record<AppTabId, ReadonlySet<string>>> = {
  history: new Set<string>(["insights", "fixed", "oneoff"]),
  forecast: new Set<string>(["forecast", "scenarios"]),
  review: new Set<ReviewSection>([
    "import",
    "queue",
    "baseline",
    "calibrate",
    "reconcile",
  ]),
  settings: new Set<SettingsSection>(["accounts", "assumptions", "app"]),
};

const DEFAULT_SECTION: Partial<Record<AppTabId, string>> = {
  history: "insights",
  forecast: "forecast",
  review: "import",
  settings: "accounts",
};

export function parseAppHash(hash: string): AppRoute | null {
  const raw = hash.replace(/^#\/?/, "").trim();
  if (!raw) return { tab: "today" };

  const [tabPart, sectionPart, ...rest] = raw.split("/").filter(Boolean);
  if (!tabPart || !TABS.has(tabPart as AppTabId) || rest.length > 0) return null;

  const tab = tabPart as AppTabId;
  const allowed = SECTIONS[tab];
  if (!sectionPart) return { tab };

  if (!allowed?.has(sectionPart)) return null;
  return { tab, section: sectionPart };
}

export function buildAppHash(route: AppRoute): string {
  const { tab, section } = route;
  if (tab === "today" && !section) return "#/today";

  const allowed = SECTIONS[tab];
  if (section && allowed?.has(section)) {
    const def = DEFAULT_SECTION[tab];
    if (section !== def) return `#/${tab}/${section}`;
    // 仍保留默认子页路径，便于深链与分享
    return `#/${tab}/${section}`;
  }

  return `#/${tab}`;
}

export function readAppRouteFromWindow(): AppRoute {
  if (typeof window === "undefined") return { tab: "today" };
  return parseAppHash(window.location.hash) ?? { tab: "today" };
}

export function writeAppHash(route: AppRoute, mode: "push" | "replace" = "push") {
  if (typeof window === "undefined") return;
  const hash = buildAppHash(route);
  const url = new URL(window.location.href);
  if (url.hash === hash) return;
  url.hash = hash;
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (mode === "replace") window.history.replaceState(null, "", next);
  else window.history.pushState(null, "", next);
}

export function defaultSectionForTab(tab: AppTabId): string | undefined {
  return DEFAULT_SECTION[tab];
}

export function isRoutableSection(tab: AppTabId, section: string): boolean {
  return SECTIONS[tab]?.has(section) ?? false;
}
