#pragma once

#include <QImage>
#include <QObject>
#include <QPoint>
#include <QRect>
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
//
// P-MOVE-UI editor chrome (slice 1): a session has two chrome states.
//   clean     — default. Edge-to-edge canvas; the only control is a small
//               tool handle bottom-left. Everything else writes.
//   revealed  — top bar (back · title) + tool rail painted OVER the canvas.
//               Chrome zones are input-blocked while visible; the pixels
//               beneath are snapshotted on reveal and restored on hide, so
//               chrome can never destroy ink. Chrome retreats 1.5 s after a
//               canvas stroke finishes, or on handle dismissal.
// Saves remain the existing single page-001.png contract: chrome/handle
// pixels are restored in an image copy before that bitmap is written. No
// note metadata, page format, or storage layout changes in this slice.
class InkModeController : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool active READ active NOTIFY activeChanged)
    Q_PROPERTY(QString noteId READ noteId NOTIFY noteIdChanged)
    Q_PROPERTY(QString tool READ tool NOTIFY toolChanged)
    Q_PROPERTY(QString color READ color NOTIFY toolChanged)
    Q_PROPERTY(QString chrome READ chromeName NOTIFY chromeChanged)
    Q_PROPERTY(QString lastRetreat READ lastRetreat NOTIFY chromeChanged)
    Q_PROPERTY(bool ready READ ready NOTIFY chromeChanged)
    Q_PROPERTY(bool testBridgeEnabled READ testBridgeEnabled CONSTANT)

public:
    explicit InkModeController(QObject *parent = nullptr);

    bool active() const { return m_active; }
    QString noteId() const { return m_noteId; }
    QString tool() const;
    QString color() const;
    QString chromeName() const;
    QString lastRetreat() const { return m_lastRetreat; }
    bool ready() const { return m_ready; }
    bool testBridgeEnabled() const;
    QImage captureFrame() const { return m_captureFrame; }

    Q_INVOKABLE void enter(const QString &noteId);
    Q_INVOKABLE void exit() { leave(0); }
    Q_INVOKABLE void toggleChrome();
    Q_INVOKABLE void revealChrome();
    Q_INVOKABLE void hideChrome();
    // Test fixture: drives the same retreat path a finished canvas stroke
    // takes, minus the 1.5 s timer. Never injects or persists pen input.
    Q_INVOKABLE void simulateWritingRetreat();

signals:
    void activeChanged();
    void noteIdChanged();
    void toolChanged();
    void chromeChanged();
    void exited(int exitCode);

private:
    enum class Chrome { Clean, Revealed };

    void beginSession();
    void leave(int code);
    void drawPage();
    void drawToolbar();
    bool handleToolbarTap(const QPoint &point);
    bool savePage();
    void setActive(bool active);

    QRect handleRect() const;
    QRect topChromeRect() const;
    QRect railChromeRect() const;   // null in landscape
    bool inChromeZone(const QPoint &point) const;
    void paintHandle(bool inverted);
    void eraseHandle();
    void applyReveal();
    void applyHide(const QString &reason, bool present);
    void scheduleWritingRetreat();
    bool m_active = false;
    bool m_leaving = false;
    bool m_ready = false;
    QString m_noteDir;
    QString m_noteId;
    QString m_noteTitle;
    int m_screenW = 954;
    int m_screenH = 1696;
    bool m_landscape = false;
    bool m_penWasDown = false;
    bool m_downInBackZone = false;
    bool m_downInHeader = false;
    bool m_downInHandle = false;
    bool m_canvasDirty = false;
    Chrome m_chrome = Chrome::Clean;
    QString m_lastRetreat;
    QImage m_topUnder;      // canvas pixels beneath revealed chrome
    QImage m_railUnder;
    QImage m_handleUnder;   // canvas pixels beneath the clean-state handle
    QImage m_cleanCanvasFrame; // immutable entry canvas for read-only retreat
    QImage m_captureFrame;  // exact last full frame painted for presentation
    quint64 m_retreatGeneration = 0;
    EvdevMarkerSource *m_evdev = nullptr;
};
