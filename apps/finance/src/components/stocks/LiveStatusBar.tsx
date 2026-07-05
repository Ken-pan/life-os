import type { LiveTrackStatus } from "../../hooks/useHoldingsLive";
import { useLocale } from "../../i18n/context";

const STATUS_DOT: Record<LiveTrackStatus, string> = {
  idle: "dot",
  loading: "dot warn",
  live: "dot ok",
  partial: "dot warn",
  stale: "dot warn",
  error: "dot critical",
  paused: "dot",
};

export function LiveStatusBar({
  status,
  updatedAt,
  pollIntervalSec,
  error,
}: {
  status: LiveTrackStatus;
  updatedAt: string | null;
  pollIntervalSec: number;
  error: string | null;
}) {
  const { t, intlLocale } = useLocale();
  const timeLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString(intlLocale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "--";

  return (
    <div className="stocks-live-status">
      <span className={STATUS_DOT[status]} aria-hidden />
      <span>
        {t("stocks.liveStatus.barTemplate", {
          status: t(`stocks.liveStatus.${status}`),
          time: timeLabel,
          interval: pollIntervalSec,
        })}
      </span>
      {error && status !== "live" && (
        <span className="stocks-live-status-note">{error}</span>
      )}
    </div>
  );
}
