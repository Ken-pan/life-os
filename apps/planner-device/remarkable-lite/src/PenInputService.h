#pragma once

#include <QObject>
#include <QPointF>
#include <QString>
#include <QVariantMap>

class QSocketNotifier;
class QQuickWindow;

// Marker input for the reMarkable Paper Pro Move (chiappa). The epaper QPA
// only delivers touch, so this service reads the pen's evdev node directly
// ("Elan marker input", discovered by name — never a hardcoded event number),
// calibrates axes via EVIOCGABS at runtime, and re-injects contact as
// standard mouse events into the QML window so every MouseArea works with
// the pen unchanged. Pressure/hover/eraser are exposed as properties for
// ink-aware pages (Quick Note).
class PenInputService : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool available READ available NOTIFY availableChanged)
    Q_PROPERTY(bool penInRange READ penInRange NOTIFY penStateChanged)
    Q_PROPERTY(bool penTouching READ penTouching NOTIFY penStateChanged)
    Q_PROPERTY(bool eraserActive READ eraserActive NOTIFY penStateChanged)
    Q_PROPERTY(qreal pressure READ pressure NOTIFY penStateChanged)
    Q_PROPERTY(QString calibrationInfo READ calibrationInfo NOTIFY availableChanged)

public:
    explicit PenInputService(QObject *parent = nullptr);
    ~PenInputService() override;

    void setWindow(QQuickWindow *window) { m_window = window; }

    bool available() const { return m_fd >= 0; }
    bool penInRange() const { return m_toolPen || m_toolRubber; }
    bool penTouching() const { return m_touching; }
    bool eraserActive() const { return m_toolRubber; }
    qreal pressure() const { return m_pressureNorm; }
    QString calibrationInfo() const { return m_calibrationInfo; }

signals:
    void availableChanged();
    void penStateChanged();

private slots:
    void readPending();

private:
    struct Axis { int min = 0; int max = 1; };

    int m_fd = -1;
    QSocketNotifier *m_notifier = nullptr;
    QQuickWindow *m_window = nullptr;

    Axis m_axisX, m_axisY, m_axisPressure, m_axisDistance;
    bool m_swapXY = false;
    bool m_invertX = false;
    bool m_invertY = false;
    QString m_calibrationInfo;

    // Current frame state (evdev is stateful; SYN_REPORT closes a frame).
    bool m_toolPen = false;
    bool m_toolRubber = false;
    bool m_touching = false;
    bool m_wasTouching = false;
    int m_rawX = 0, m_rawY = 0, m_rawPressure = 0;
    bool m_frameDirty = false;
    bool m_desynced = false;
    qreal m_pressureNorm = 0.0;
    int m_downLogBudget = 3;
    QPointF m_lastInjected;
    bool m_notifiedTouching = false;
    bool m_notifiedRubber = false;
    bool m_notifiedInRange = false;

    QString findPenDevice() const;
    void openDevice();
    void loadCalibrationOverrides();
    QPointF mapToScreen() const;
    void dispatchFrame();
    void injectMouse(const QPointF &pos, bool down, bool up);
};
