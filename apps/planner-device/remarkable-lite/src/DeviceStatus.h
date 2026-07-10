#pragma once

#include <QObject>
#include <QString>
#include <QVariantMap>
#include <QTimer>

// Read-only device telemetry for the System/Home pages. Everything is
// probed from /sys or Qt APIs; nothing here writes to hardware.
class DeviceStatus : public QObject
{
    Q_OBJECT
    Q_PROPERTY(int batteryPercent READ batteryPercent NOTIFY statusChanged)
    Q_PROPERTY(QString batteryState READ batteryState NOTIFY statusChanged)
    Q_PROPERTY(QString wifiState READ wifiState NOTIFY statusChanged)
    Q_PROPERTY(double storageFreeGb READ storageFreeGb NOTIFY statusChanged)
    Q_PROPERTY(double storageTotalGb READ storageTotalGb NOTIFY statusChanged)
    Q_PROPERTY(QString appVersion READ appVersion CONSTANT)

public:
    explicit DeviceStatus(QObject *parent = nullptr);

    int batteryPercent() const { return m_batteryPercent; }
    QString batteryState() const { return m_batteryState; }
    QString wifiState() const { return m_wifiState; }
    double storageFreeGb() const { return m_storageFreeGb; }
    double storageTotalGb() const { return m_storageTotalGb; }
    QString appVersion() const { return QStringLiteral("0.2.0-shell"); }

    Q_INVOKABLE void refresh();
    Q_INVOKABLE QVariantMap frontlightProbe() const;

signals:
    void statusChanged();

private:
    int m_batteryPercent = -1;
    QString m_batteryState;
    QString m_wifiState;
    double m_storageFreeGb = 0;
    double m_storageTotalGb = 0;
    QTimer m_timer;

    QString readSysFile(const QString &path) const;
};
