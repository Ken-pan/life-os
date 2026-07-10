#include "NoteStore.h"
#include "PaperOsPaths.h"

#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QDateTime>
#include <QDebug>

NoteStore::NoteStore(QObject *parent) : QObject(parent)
{
    m_noteCount = QDir(notesDir()).entryList(QDir::Dirs | QDir::NoDotAndDotDot).size();
    qInfo() << "PaperOS notes:" << m_noteCount;
}

QString NoteStore::notesDir() const
{
    return paperosHome() + QStringLiteral("/data/notes");
}

QString NoteStore::createNote(const QString &kind)
{
    const QString noteId = QStringLiteral("note-%1")
        .arg(QDateTime::currentDateTimeUtc().toString(QStringLiteral("yyyyMMdd-HHmmss")));
    const QString dir = notesDir() + QLatin1Char('/') + noteId;
    if (!QDir().mkpath(dir)) {
        qWarning() << "PaperOS notes: cannot create" << dir;
        return QString();
    }

    QJsonObject meta;
    meta["noteId"] = noteId;
    meta["kind"] = kind.isEmpty() ? QStringLiteral("quick") : kind;
    meta["createdAt"] = QDateTime::currentDateTimeUtc().toString(Qt::ISODate);
    meta["format"] = QStringLiteral("strokes-jsonl-v1");

    QFile metaFile(dir + QStringLiteral("/meta.json"));
    if (metaFile.open(QIODevice::WriteOnly | QIODevice::Truncate))
        metaFile.write(QJsonDocument(meta).toJson(QJsonDocument::Indented));

    ++m_noteCount;
    emit noteCountChanged();
    qInfo() << "PaperOS note created:" << noteId;
    return noteId;
}

bool NoteStore::appendStroke(const QString &noteId, const QVariantList &points)
{
    if (noteId.isEmpty() || points.isEmpty())
        return false;

    QFile file(notesDir() + QLatin1Char('/') + noteId + QStringLiteral("/page-001.strokes.jsonl"));
    if (!file.open(QIODevice::WriteOnly | QIODevice::Append)) {
        qWarning() << "PaperOS notes: cannot append stroke for" << noteId;
        return false;
    }
    file.write(QJsonDocument(QJsonArray::fromVariantList(points)).toJson(QJsonDocument::Compact));
    file.write("\n");
    return true;
}

QVariantMap NoteStore::inputProbe() const
{
    // Enumerate input devices so the Quick Note gap analysis is grounded in
    // what the hardware actually exposes (pen vs touch vs buttons).
    QVariantMap result;
    QVariantList devices;

    QFile procFile(QStringLiteral("/proc/bus/input/devices"));
    if (procFile.open(QIODevice::ReadOnly)) {
        // procfs: read whole file; readLine/atEnd loops end at size 0.
        const QStringList lines = QString::fromUtf8(procFile.readAll()).split('\n');
        QVariantMap current;
        for (const QString &rawLine : lines) {
            const QString line = rawLine.trimmed();
            if (line.startsWith("N: Name=")) {
                current["name"] = line.mid(8).remove('"');
            } else if (line.startsWith("H: Handlers=")) {
                current["handlers"] = line.mid(12);
            } else if (line.isEmpty() && !current.isEmpty()) {
                devices.append(current);
                current.clear();
            }
        }
        if (!current.isEmpty())
            devices.append(current);
    }

    result["devices"] = devices;
    result["eventNodes"] = QDir(QStringLiteral("/dev/input"))
        .entryList({QStringLiteral("event*")}, QDir::System | QDir::Files | QDir::AllEntries);
    qInfo() << "PaperOS input probe:" << result;
    return result;
}
