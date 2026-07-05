import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

type HorizontalTabItem<T extends string> = {
  id: T;
  label: string;
};

type TabGroupContextValue = {
  prefix: string;
};

const TabGroupContext = createContext<TabGroupContextValue | null>(null);

function useTabGroup() {
  const ctx = useContext(TabGroupContext);
  if (!ctx) {
    throw new Error("TabPanel must be rendered inside HorizontalTabs.");
  }
  return ctx;
}

export function tabPanelId(prefix: string, id: string) {
  return `${prefix}-panel-${id}`;
}

export function tabButtonId(prefix: string, id: string) {
  return `${prefix}-tab-${id}`;
}

export function TabPanel<T extends string>({
  tabId,
  active,
  children,
  className,
}: {
  tabId: T;
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  const { prefix } = useTabGroup();
  const panelId = tabPanelId(prefix, tabId);
  const labelId = tabButtonId(prefix, tabId);

  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={labelId}
      hidden={!active}
      className={className}
      tabIndex={active ? 0 : undefined}
    >
      {active ? children : null}
    </div>
  );
}

export function HorizontalTabs<T extends string>({
  items,
  activeId,
  onChange,
  ariaLabel,
  className,
  tablistWrapperClassName,
  scrollFadeBg,
  children,
}: {
  items: HorizontalTabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
  /** 可选：包裹 tablist 的容器 class（如 settings-intro） */
  tablistWrapperClassName?: string;
  /** 横向 fade 渐隐底色，默认 var(--bg) */
  scrollFadeBg?: string;
  children?: ReactNode;
}) {
  const tablistRef = useRef<HTMLDivElement>(null);
  const listId = useId().replace(/:/g, "");

  const focusTab = useCallback(
    (id: T) => {
      tablistRef.current?.querySelector<HTMLButtonElement>(`#${tabButtonId(listId, id)}`)?.focus();
    },
    [listId]
  );

  useEffect(() => {
    const activeTab = tablistRef.current?.querySelector<HTMLButtonElement>(
      `#${tabButtonId(listId, activeId)}`
    );
    if (!activeTab) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    activeTab.scrollIntoView({
      inline: "nearest",
      block: "nearest",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [activeId, listId]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const { key } = event;
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;

      event.preventDefault();
      let nextIndex = index;
      if (key === "ArrowRight") nextIndex = (index + 1) % items.length;
      else if (key === "ArrowLeft") nextIndex = (index - 1 + items.length) % items.length;
      else if (key === "Home") nextIndex = 0;
      else if (key === "End") nextIndex = items.length - 1;

      const nextId = items[nextIndex].id;
      onChange(nextId);
      requestAnimationFrame(() => focusTab(nextId));
    },
    [focusTab, items, onChange]
  );

  const tablist = (
    <div
      className="life-os-scroll-fade"
      style={
        scrollFadeBg
          ? ({ ["--life-os-scroll-fade-bg" as string]: scrollFadeBg } as React.CSSProperties)
          : undefined
      }
    >
      <div
        ref={tablistRef}
        className={["horizontal-tabs", "life-os-scroll-x", "life-os-scroll-x--snap", className]
          .filter(Boolean)
          .join(" ")}
        role="tablist"
        aria-label={ariaLabel}
      >
        {items.map((item, index) => {
          const selected = activeId === item.id;
          const buttonId = tabButtonId(listId, item.id);
          const panelId = tabPanelId(listId, item.id);
          return (
            <button
              key={item.id}
              id={buttonId}
              type="button"
              role="tab"
              className={`horizontal-tab${selected ? " active" : ""}`}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <TabGroupContext.Provider value={{ prefix: listId }}>
      {tablistWrapperClassName ? <div className={tablistWrapperClassName}>{tablist}</div> : tablist}
      {children}
    </TabGroupContext.Provider>
  );
}
