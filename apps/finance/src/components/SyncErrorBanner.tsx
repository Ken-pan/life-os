import { useEffect, useState } from "react";
import { subscribeSyncError } from "../lib/syncNotify";
import { useLocale } from "../i18n/context";

export function SyncErrorBanner() {
  const { t } = useLocale();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    return subscribeSyncError((msg) => setMessage(msg));
  }, []);

  if (!message) return null;

  return (
    <div className="banner critical banner--row" role="alert">
      <span>
        {t("sync.bannerPrefix")}
        {message}
        {t("sync.bannerSuffix")}
      </span>
      <button
        type="button"
        className="btn ghost compact"
        onClick={() => setMessage(null)}
      >
        {t("common.close")}
      </button>
    </div>
  );
}
