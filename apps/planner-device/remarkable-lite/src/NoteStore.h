#pragma once

#include <QObject>
#include <QString>
#include <QVariantList>
#include <QVariantMap>

// Quick Note v0 storage: raw ink first, recognition later. Each note is a
// directory under data/notes/ holding meta.json and one strokes JSONL file
// (one stroke — an array of {x,y,p,t} points — per line).
class NoteStore : public QObject
{
    Q_OBJECT
    Q_PROPERTY(int noteCount READ noteCount NOTIFY noteCountChanged)

public:
    explicit NoteStore(QObject *parent = nullptr);

    int noteCount() const { return m_noteCount; }

    Q_INVOKABLE QString createNote(const QString &kind);
    Q_INVOKABLE bool saveStrokes(const QString &noteId, const QVariantList &strokes);
    Q_INVOKABLE QVariantMap inputProbe() const;

signals:
    void noteCountChanged();

private:
    int m_noteCount = 0;
    QString notesDir() const;
};
