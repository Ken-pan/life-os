#pragma once
#include <QObject>
#include <QString>
#include <QJsonObject>
#include <QFile>

class PerfLog : public QObject {
    Q_OBJECT
public:
    static PerfLog& instance();

    Q_INVOKABLE void log(const QString& eventName, const QJsonObject& payload = QJsonObject());

private:
    explicit PerfLog(QObject* parent = nullptr);
    ~PerfLog();

    QFile m_file;
};
