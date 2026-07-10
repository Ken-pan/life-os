#include "PerfLog.h"
#include <time.h>
#include <QJsonDocument>
#include <QDateTime>
#include <QDir>
#include <QThread>

PerfLog& PerfLog::instance() {
    static PerfLog inst;
    return inst;
}

PerfLog::PerfLog(QObject* parent) : QObject(parent), m_file("/tmp/paperos-test-driver/events.jsonl") {
    QDir().mkpath("/tmp/paperos-test-driver");
    if (!m_file.open(QIODevice::WriteOnly | QIODevice::Append | QIODevice::Text)) {
        qWarning("PerfLog: failed to open events.jsonl");
    }
}

PerfLog::~PerfLog() {
    if (m_file.isOpen()) {
        m_file.close();
    }
}

void PerfLog::log(const QString& eventName, const QJsonObject& payload) {
    if (!m_file.isOpen()) return;

    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC_RAW, &ts);
    double monotonicTime = ts.tv_sec + (ts.tv_nsec / 1e9);

    QJsonObject obj = payload;
    obj["event"] = eventName;
    obj["monotonic_time"] = monotonicTime;
    obj["wall_time"] = QDateTime::currentMSecsSinceEpoch();

    QByteArray data = QJsonDocument(obj).toJson(QJsonDocument::Compact);
    data.append('\n');

    m_file.write(data);
    m_file.flush();
}
