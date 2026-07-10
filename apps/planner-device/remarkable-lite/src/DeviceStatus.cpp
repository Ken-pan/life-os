#include "DeviceStatus.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QStorageInfo>
#include <QVariantList>
#include <QDebug>

DeviceStatus::DeviceStatus(QObject *parent) : QObject(parent)
{
    refresh();
    m_timer.setInterval(60 * 1000);
    connect(&m_timer, &QTimer::timeout, this, &DeviceStatus::refresh);
    m_timer.start();
}

QString DeviceStatus::readSysFile(const QString &path) const
{
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly))
        return QString();
    return QString::fromUtf8(file.readAll()).trimmed();
}

void DeviceStatus::refresh()
{
    // Battery: first power_supply entry that exposes a capacity file.
    m_batteryPercent = -1;
    m_batteryState.clear();
    const QDir psDir(QStringLiteral("/sys/class/power_supply"));
    for (const QString &entry : psDir.entryList(QDir::Dirs | QDir::NoDotAndDotDot)) {
        const QString capacity = readSysFile(psDir.filePath(entry + "/capacity"));
        if (!capacity.isEmpty()) {
            m_batteryPercent = capacity.toInt();
            m_batteryState = readSysFile(psDir.filePath(entry + "/status"));
            break;
        }
    }

    // Wi-Fi: operstate of the first wireless-looking interface.
    m_wifiState = QStringLiteral("unknown");
    const QDir netDir(QStringLiteral("/sys/class/net"));
    for (const QString &entry : netDir.entryList(QDir::Dirs | QDir::NoDotAndDotDot)) {
        if (entry.startsWith("wlan") || entry.startsWith("wlp")) {
            m_wifiState = readSysFile(netDir.filePath(entry + "/operstate"));
            break;
        }
    }

    const QStorageInfo home(QStringLiteral("/home"));
    m_storageFreeGb = home.bytesAvailable() / 1e9;
    m_storageTotalGb = home.bytesTotal() / 1e9;

    emit statusChanged();
}

QVariantMap DeviceStatus::frontlightProbe() const
{
    // Probe-only: report what exists and whether it looks controllable.
    // No writes — a brightness control ships only once a reversible write
    // path is verified by hand.
    QVariantMap result;
    QVariantList candidates;

    const QDir backlight(QStringLiteral("/sys/class/backlight"));
    for (const QString &entry : backlight.entryList(QDir::Dirs | QDir::NoDotAndDotDot)) {
        QVariantMap c;
        c["path"] = backlight.filePath(entry);
        c["kind"] = "backlight";
        c["brightness"] = readSysFile(backlight.filePath(entry + "/brightness"));
        c["maxBrightness"] = readSysFile(backlight.filePath(entry + "/max_brightness"));
        c["writable"] = QFileInfo(backlight.filePath(entry + "/brightness")).isWritable();
        candidates.append(c);
    }

    const QDir leds(QStringLiteral("/sys/class/leds"));
    for (const QString &entry : leds.entryList(QDir::Dirs | QDir::NoDotAndDotDot)) {
        QVariantMap c;
        c["path"] = leds.filePath(entry);
        c["kind"] = "led";
        c["brightness"] = readSysFile(leds.filePath(entry + "/brightness"));
        c["writable"] = QFileInfo(leds.filePath(entry + "/brightness")).isWritable();
        candidates.append(c);
    }

    result["candidates"] = candidates;
    result["available"] = !candidates.isEmpty();
    qInfo() << "PaperOS frontlight probe:" << result;
    return result;
}
