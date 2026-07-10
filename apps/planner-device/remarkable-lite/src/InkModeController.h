#pragma once

#include <QObject>
#include <QPoint>
#include <QString>

class EvdevMarkerSource;

// Native ink mode, hosted INSIDE the shell process. The vendor display stack
// holds a process-exclusive lock ("Failed to lock epframebuffer" + SIGABRT in
// any second process), so a separate ink-runtime process cannot initialize
// while the shell owns the panel. Instead, enter() freezes the Qt Quick
// scenegraph (static QML overlay, no swaps), reuses the shell's own
// EPFramebuffer instance, and drives the panel directly with the proven
// live-ink pipeline (raw evdev grab, pressure raster, QualityFastest partial
// swaps). exit restores the QML scene with one CompleteRefresh.
//
// Tradeoff vs. the Phase 2B separate-process target: no crash isolation —
// but no lock conflict and instant enter/exit. Marker grab guarantees the
// QPA sees no pen input while the session owns the canvas.
class InkModeController : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool active READ active NOTIFY activeChanged)
    Q_PROPERTY(QString noteId READ noteId NOTIFY noteIdChanged)
    Q_PROPERTY(QString tool READ tool NOTIFY toolChanged)
    Q_PROPERTY(QString color READ color NOTIFY toolChanged)

public:
    explicit InkModeController(QObject *parent = nullptr);

    bool active() const { return m_active; }
    QString noteId() const { return m_noteId; }
    QString tool() const;
    QString color() const;

    Q_INVOKABLE void enter(const QString &noteId);
    Q_INVOKABLE void exit() { leave(0); }

signals:
    void activeChanged();
    void noteIdChanged();
    void toolChanged();
    void exited(int exitCode);

private:
    void beginSession();
    void leave(int code);
    void drawPage();
    void drawToolbar();
    bool handleToolbarTap(const QPoint &point);
    bool savePage();
    void setActive(bool active);

    bool m_active = false;
    bool m_leaving = false;
    QString m_noteDir;
    QString m_noteId;
    QString m_noteTitle;
    int m_screenW = 954;
    int m_screenH = 1696;
    bool m_landscape = false;
    bool m_penWasDown = false;
    bool m_downInBackZone = false;
    bool m_downInHeader = false;
    EvdevMarkerSource *m_evdev = nullptr;
};
