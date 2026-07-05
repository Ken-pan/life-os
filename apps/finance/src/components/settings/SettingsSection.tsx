import type { ReactNode } from "react";

export function SettingsSection({
  title,
  desc,
  testId,
  children,
}: {
  title: string;
  desc?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div className="card settings-section" data-testid={testId}>
      <h3>{title}</h3>
      {desc ? <p className="muted-note">{desc}</p> : null}
      {children}
    </div>
  );
}
