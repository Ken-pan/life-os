type OverflowOffender = {
  tag: string;
  className: string;
  id: string;
  left: number;
  right: number;
  width: number;
};

export type HorizontalOverflowReport = {
  viewportWidth: number;
  scrollWidth: number;
  overflowPx: number;
  offenders: OverflowOffender[];
};

export function getHorizontalOverflowReport(doc: Document = document): HorizontalOverflowReport | null {
  const root = doc.documentElement;
  const viewportWidth = root.clientWidth;
  const scrollWidth = root.scrollWidth;
  const overflowPx = scrollWidth - viewportWidth;
  if (overflowPx <= 1) return null;

  const offenders: OverflowOffender[] = [];
  for (const node of doc.querySelectorAll<HTMLElement>("body *")) {
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.left >= -1 && rect.right <= viewportWidth + 1) continue;
    offenders.push({
      tag: node.tagName.toLowerCase(),
      className: node.className ?? "",
      id: node.id ?? "",
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
    });
    if (offenders.length >= 12) break;
  }

  return {
    viewportWidth,
    scrollWidth,
    overflowPx,
    offenders,
  };
}

export function installHorizontalOverflowGuard(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  let raf = 0;
  let lastWarningKey = "";

  const check = () => {
    raf = 0;
    const report = getHorizontalOverflowReport(document);
    if (!report) return;
    const warningKey = `${report.viewportWidth}:${report.scrollWidth}:${report.offenders.length}`;
    if (warningKey === lastWarningKey) return;
    lastWarningKey = warningKey;
    console.warn("[ui-overflow-guard] Horizontal overflow detected", report);
  };

  const scheduleCheck = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(check);
  };

  const observer = new MutationObserver(scheduleCheck);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  window.addEventListener("resize", scheduleCheck);
  window.addEventListener("orientationchange", scheduleCheck);
  scheduleCheck();

  return () => {
    if (raf) window.cancelAnimationFrame(raf);
    observer.disconnect();
    window.removeEventListener("resize", scheduleCheck);
    window.removeEventListener("orientationchange", scheduleCheck);
  };
}
