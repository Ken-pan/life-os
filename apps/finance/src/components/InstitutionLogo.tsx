import type { CSSProperties } from "react";
import type { AccountType } from "../types";
import {
  institutionLogoSrc,
  resolveInstitutionMetaFrom,
} from "../lib/institutionLogos";

type LogoSize = "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<LogoSize, number> = { sm: 20, md: 28, lg: 40, xl: 48 };

export function InstitutionLogo({
  name,
  accountType,
  issuer,
  billLabel,
  source,
  size = "md",
  className = "",
}: {
  name?: string;
  accountType?: AccountType;
  issuer?: string;
  billLabel?: string;
  source?: string;
  size?: LogoSize;
  className?: string;
}) {
  const meta = resolveInstitutionMetaFrom({ name, accountType, issuer, billLabel, source });
  const px = SIZE_PX[size];
  const src = institutionLogoSrc(meta.id);

  return (
    <span
      className={`institution-logo institution-logo--${size}${className ? ` ${className}` : ""}`}
      style={{ width: px, height: px, "--brand": meta.color } as CSSProperties}
      title={meta.label}
      aria-hidden
    >
      <img
        src={src}
        alt=""
        width={px}
        height={px}
        loading="lazy"
        onError={(e) => {
          const img = e.currentTarget;
          img.style.display = "none";
          const fallback = img.nextElementSibling;
          if (fallback instanceof HTMLElement) fallback.style.display = "flex";
        }}
      />
      <span
        className="institution-logo-fallback"
        style={{ background: meta.color, display: "none" }}
        aria-hidden
      >
        {meta.initials || meta.label.slice(0, 1)}
      </span>
    </span>
  );
}
