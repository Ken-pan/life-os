#ifndef PAPEROS_METRICS_H
#define PAPEROS_METRICS_H

#include <QString>
#include <QJsonObject>

namespace Metrics {

// Write a structured JSONL event to /tmp/paperos-test-driver/ink-metrics.jsonl
void logEvent(const QString& type, const QJsonObject& extra = QJsonObject());

} // namespace Metrics

#endif // PAPEROS_METRICS_H
