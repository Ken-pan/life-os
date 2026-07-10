#include "ActionQueue.h"
#include "PaperOsPaths.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QDateTime>
#include <QDebug>

static const QStringList kSupportedActions = {
    QStringLiteral("task.complete"),
    QStringLiteral("task.defer"),
    QStringLiteral("task.add"),
    QStringLiteral("mail.convert_to_task"),
    QStringLiteral("note.create"),
};

ActionQueue::ActionQueue(QObject *parent) : QObject(parent)
{
    QFile file(queuePath());
    if (file.open(QIODevice::ReadOnly)) {
        while (!file.atEnd()) {
            if (!file.readLine().trimmed().isEmpty())
                ++m_pendingCount;
        }
    }
    qInfo() << "PaperOS action queue: pending =" << m_pendingCount;
}

QString ActionQueue::queuePath() const
{
    return paperosHome() + QStringLiteral("/data/queue/actions.jsonl");
}

bool ActionQueue::enqueue(const QString &type, const QVariantMap &payload)
{
    if (!kSupportedActions.contains(type)) {
        qWarning() << "PaperOS action queue: unsupported action" << type;
        return false;
    }

    QJsonObject entry = QJsonObject::fromVariantMap(payload);
    entry["type"] = type;
    entry["createdAt"] = QDateTime::currentDateTimeUtc().toString(Qt::ISODate);
    entry["clientActionId"] = QStringLiteral("act-%1-%2")
        .arg(QDateTime::currentMSecsSinceEpoch())
        .arg(m_pendingCount);

    const QString path = queuePath();
    QDir().mkpath(QFileInfo(path).absolutePath());
    QFile file(path);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Append)) {
        qWarning() << "PaperOS action queue: cannot open" << path;
        return false;
    }
    file.write(QJsonDocument(entry).toJson(QJsonDocument::Compact));
    file.write("\n");
    file.close();

    ++m_pendingCount;
    emit pendingCountChanged();
    qInfo() << "PaperOS action queued:" << type;
    return true;
}
