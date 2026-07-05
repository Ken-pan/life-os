import type { CardPortal } from "../lib/cardPortals";
import { InstitutionLogo } from "./InstitutionLogo";

export function CardPortalLink({
  portal,
  compact = false,
  showLogo = true,
}: {
  portal: CardPortal;
  compact?: boolean;
  showLogo?: boolean;
}) {
  const label = compact ? "付款" : portal.appPreferred ? "登录（App 付款）" : "登录 / 付款";
  return (
    <span className="portal-link-wrap">
      {showLogo && <InstitutionLogo issuer={portal.issuer} size="sm" />}
      <a
        className="portal-link"
        href={portal.url}
        target="_blank"
        rel="noopener noreferrer"
        title={`在 ${portal.issuer} 官网${portal.appPreferred ? "登录（付款请用 App）" : "登录或付款"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {label}
      </a>
    </span>
  );
}
