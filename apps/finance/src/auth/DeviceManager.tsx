import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  describeThisBrowser,
  deviceClassLabel,
  isThisDeviceSlot,
  listDevices,
  MAX_DEVICES,
  removeDevice,
  type DeviceRow,
} from "../lib/devices";
import { useLocale } from "../i18n/context";
import { formatDateTimeForIntl } from "../format";

export function DeviceManager() {
  const { t } = useLocale();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [list, user] = await Promise.all([
        listDevices(),
        supabase.auth.getUser(),
      ]);
      setDevices(list);
      setEmail(user.data.user?.email ?? "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("device.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const handleRemove = async (id: string) => {
    const row = devices.find((d) => d.id === id);
    const thisSlot = row ? isThisDeviceSlot(row) : false;
    const msg = thisSlot
      ? t("device.confirmThisSlot", {
          label: row ? deviceClassLabel(row.device_class) : t("device.thisDevice"),
        })
      : t("device.confirmOther");
    if (!window.confirm(msg)) return;
    try {
      await removeDevice(id);
      if (thisSlot) {
        await supabase.auth.signOut();
        return;
      }
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("device.removeFailed"));
    }
  };

  const fmt = (s: string | null) => (s ? formatDateTimeForIntl(s) : "—");

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="flush">{t("device.title")}</h3>
        <button type="button" className="icon-btn" onClick={() => supabase.auth.signOut()}>
          {t("device.signOut")}
        </button>
      </div>
      <p className="muted-note">
        {t("device.intro", {
          email: email || "—",
          max: String(MAX_DEVICES),
          used: String(devices.length),
        })}
      </p>

      {err && <p className="text-critical">{err}</p>}
      {loading ? (
        <p className="muted-note">{t("device.loading")}</p>
      ) : (
        <div className="list">
          {devices.length === 0 && (
            <div className="kv">
              <span className="text-secondary">{t("device.empty")}</span>
            </div>
          )}
          {devices.map((d) => (
            <div key={d.id} className="kv">
              <span className="k">
                {d.label}
                {isThisDeviceSlot(d) && (
                  <span className="tag accent">
                    {t("device.current", { browser: describeThisBrowser() })}
                  </span>
                )}
              </span>
              <span className="text-secondary device-meta">
                {t("device.authorized", {
                  created: fmt(d.created_at),
                  lastSeen: fmt(d.last_seen_at),
                })}
              </span>
              <button type="button" className="icon-btn" onClick={() => handleRemove(d.id)}>
                {t("device.remove")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
