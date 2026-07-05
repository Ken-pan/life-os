import type { ReactNode } from "react";

export function SettingsPrefRow({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className="pref-row">
      <div className="pref-copy">
        <div className="pref-label">{label}</div>
        {desc ? <p className="pref-desc">{desc}</p> : null}
      </div>
      <div className="pref-control">{children}</div>
    </div>
  );
}
