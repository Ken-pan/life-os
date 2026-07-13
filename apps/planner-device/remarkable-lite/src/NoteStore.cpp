#include "NoteStore.h"
#include "PaperOsPaths.h"

#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QDateTime>
#include <QDebug>
#include <QImage>
#include <QUrl>

namespace {
double darkestRowRatio(const QImage &image, int y, int thickness)
{
    double best = 0.0;
    for (int row = y; row < qMin(image.height(), y + thickness); ++row) {
        int dark = 0;
        for (int x = 0; x < image.width(); ++x)
            dark += qGray(image.pixel(x, row)) < 64 ? 1 : 0;
        best = qMax(best, image.width() > 0 ? double(dark) / image.width() : 0.0);
    }
    return best;
}

double darkestColumnRatio(const QImage &image, int x, int yStart, int thickness)
{
    double best = 0.0;
    for (int column = x; column < qMin(image.width(), x + thickness); ++column) {
        int dark = 0;
        const int height = image.height() - yStart;
        for (int y = yStart; y < image.height(); ++y)
            dark += qGray(image.pixel(column, y)) < 64 ? 1 : 0;
        best = qMax(best, height > 0 ? double(dark) / height : 0.0);
    }
    return best;
}

bool hasLegacyBakedChrome(const QString &path)
{
    const QImage image(path);
    if (image.isNull())
        return false;
    const bool landscape = image.width() > image.height();
    const int titleY = qRound(image.height() * double(landscape ? 96 : 88)
                              / double(landscape ? 954 : 1696));
    if (darkestRowRatio(image, titleY, 4) <= 0.75)
        return false;
    if (landscape)
        return true;
    const int railX = qRound(image.width() * 96.0 / 954.0);
    return darkestColumnRatio(image, railX, titleY, 4) > 0.75;
}
}

NoteStore::NoteStore(QObject *parent) : QObject(parent)
{
    QDir().mkpath(notesDir());
    m_noteCount = QDir(notesDir()).entryList(QDir::Dirs | QDir::NoDotAndDotDot).size();
    if (m_noteCount == 0)
        createNote(QStringLiteral("default"));
    qInfo() << "PaperOS notes:" << m_noteCount;
}

QString NoteStore::notesDir() const
{
    return paperosHome() + QStringLiteral("/data/notes");
}

QVariantList NoteStore::listNotes() const
{
    QVariantList out;
    const auto entries = QDir(notesDir()).entryInfoList(
        QDir::Dirs | QDir::NoDotAndDotDot, QDir::Time);
    for (const QFileInfo &fi : entries) {
        const QString pagePath = fi.filePath() + QStringLiteral("/page-001.png");
        const QDateTime modified = fi.lastModified();
        QString title;
        QFile metaFile(fi.filePath() + QStringLiteral("/meta.json"));
        if (metaFile.open(QIODevice::ReadOnly))
            title = QJsonDocument::fromJson(metaFile.readAll()).object().value("title").toString();
        if (title.isEmpty())
            title = QStringLiteral("Notebook · %1").arg(modified.toString(QStringLiteral("MMM d")));
        QVariantMap m;
        m[QStringLiteral("noteId")] = fi.fileName();
        m[QStringLiteral("displayTitle")] = title;
        m[QStringLiteral("modifiedAt")] = modified.toString(QStringLiteral("yyyy-MM-dd HH:mm"));
        m[QStringLiteral("modifiedLabel")] =
            modified.date() == QDate::currentDate()
                ? QStringLiteral("Updated today at %1").arg(modified.toString(QStringLiteral("h:mm AP")))
                : QStringLiteral("Updated %1").arg(modified.toString(QStringLiteral("MMM d at h:mm AP")));
        m[QStringLiteral("hasInk")] = QFile::exists(pagePath);
        // Read-only compatibility signal for the gallery. Old editor saves
        // contain exact full-width/full-height separator rules; detecting
        // both rules avoids inventing a metadata version or changing format.
        m[QStringLiteral("legacyChrome")] = QFile::exists(pagePath)
            && hasLegacyBakedChrome(pagePath);
        m[QStringLiteral("pageCount")] = 1;
        m[QStringLiteral("previewUrl")] = QFile::exists(pagePath)
            ? QUrl::fromLocalFile(pagePath).toString()
            : QString();
        out.append(m);
    }
    return out;
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
    meta["title"] = kind == QLatin1String("default")
        ? QStringLiteral("My Notebook")
        : QStringLiteral("Untitled notebook");
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

// Full rewrite (not append): undo/redo must keep the file consistent with
// the canvas, and quick-note stroke files are small. One JSON object per
// line: {tool, color, width, points:[{x,y,p,t}…]}.
bool NoteStore::saveStrokes(const QString &noteId, const QVariantList &strokes)
{
    if (noteId.isEmpty())
        return false;

    QFile file(notesDir() + QLatin1Char('/') + noteId + QStringLiteral("/page-001.strokes.jsonl"));
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        qWarning() << "PaperOS notes: cannot write strokes for" << noteId;
        return false;
    }
    for (const QVariant &stroke : strokes) {
        file.write(QJsonDocument(QJsonObject::fromVariantMap(stroke.toMap()))
                       .toJson(QJsonDocument::Compact));
        file.write("\n");
    }
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
