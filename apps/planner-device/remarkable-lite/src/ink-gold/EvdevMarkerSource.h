#pragma once
#include <QObject>
#include <QSocketNotifier>
#include <functional>
#include "PenPipeline.h"

struct MarkerAbsRange {
    int min = 0;
    int max = 0;
    bool valid() const { return max > min; }
};

class EvdevMarkerSource : public QObject {
    Q_OBJECT
public:
    explicit EvdevMarkerSource(const QString& devicePath,
                               int screenWidth, int screenHeight,
                               QObject* parent = nullptr);
    ~EvdevMarkerSource();

    // Opens the device, grabs it exclusively (EVIOCGRAB) and reads the
    // ABS_X/ABS_Y/ABS_PRESSURE ranges. On failure fills errorOut and returns
    // false with the fd closed. Logs MARKER_OPENED, EVIOCGRAB_SUCCEEDED and
    // INPUT_RANGES_READ to the perf log.
    bool start(QString* errorOut = nullptr);

    // Frames are dropped until the controller declares the session live so
    // stray input cannot paint over the INITIALIZING page.
    void setAcceptInput(bool accept) { m_acceptInput = accept; }

    // Optional pre-pipeline hook (toolbar hit zones, gestures). Runs on every
    // accepted SYN frame after coordinate mapping; returning true consumes
    // the frame — it never reaches the ink pipeline.
    std::function<bool(const PenFrame&)> frameFilter;

    bool grabbed() const { return m_grabbed; }
    MarkerAbsRange rangeX() const { return m_rangeX; }
    MarkerAbsRange rangeY() const { return m_rangeY; }
    MarkerAbsRange rangePressure() const { return m_rangePressure; }

    int mapX(int raw) const;
    int mapY(int raw) const;

    // Non-visible coordinate check: raw min maps to 0, raw max maps to
    // width-1/height-1, center maps strictly inside the screen. Logs the
    // mapping formula and the check result; fills detailOut on failure.
    bool validateMapping(QString* detailOut = nullptr);

signals:
    void firstContact();

private slots:
    void onReadyRead();

private:
    QString m_devicePath;
    int m_screenWidth;
    int m_screenHeight;
    int m_fd = -1;
    bool m_grabbed = false;
    bool m_acceptInput = false;
    bool m_firstContactSeen = false;
    QSocketNotifier* m_notifier = nullptr;
    PenPipeline m_pipeline;
    MarkerAbsRange m_rangeX;
    MarkerAbsRange m_rangeY;
    MarkerAbsRange m_rangePressure;

    PenFrame m_currentFrame;
};
