#include "metrics.h"
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTextStream>
#include <QDateTime>

namespace Metrics {

void logEvent(const QString& type, const QJsonObject& extra) {
    QJsonObject obj = extra;
    obj["type"] = type;
    obj["timestamp"] = QDateTime::currentMSecsSinceEpoch();

    QFile file("/tmp/paperos-test-driver/ink-metrics.jsonl");
    if (file.open(QIODevice::Append | QIODevice::Text)) {
        QTextStream out(&file);
        out << QJsonDocument(obj).toJson(QJsonDocument::Compact) << "\n";
    }
}

} // namespace Metrics
