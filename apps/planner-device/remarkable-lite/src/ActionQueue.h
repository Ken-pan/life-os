#pragma once

#include <QObject>
#include <QVariantMap>
#include <QStringList>

// Offline-first action queue. Every user action is appended as one JSON
// line to data/queue/actions.jsonl; a future sync worker drains it. The
// queue survives crashes and network loss — v0 never deletes entries.
class ActionQueue : public QObject
{
    Q_OBJECT
    Q_PROPERTY(int pendingCount READ pendingCount NOTIFY pendingCountChanged)

public:
    explicit ActionQueue(QObject *parent = nullptr);

    int pendingCount() const { return m_pendingCount; }

    Q_INVOKABLE bool enqueue(const QString &type, const QVariantMap &payload);

signals:
    void pendingCountChanged();

private:
    int m_pendingCount = 0;
    QString queuePath() const;
};
