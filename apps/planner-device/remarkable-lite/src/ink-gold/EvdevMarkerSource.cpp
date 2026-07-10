#include "EvdevMarkerSource.h"
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/input.h>
#include <QDebug>
#include <QJsonObject>
#include "DisplayScheduler.h"
#include "../PerfLog.h"
#include <time.h>

EvdevMarkerSource::EvdevMarkerSource(const QString& devicePath,
                                     int screenWidth, int screenHeight,
                                     QObject* parent)
    : QObject(parent), m_devicePath(devicePath),
      m_screenWidth(screenWidth), m_screenHeight(screenHeight) {
    m_currentFrame.rawX = 0;
    m_currentFrame.rawY = 0;
    m_currentFrame.rawPressure = 0;
    m_currentFrame.touching = false;
    m_currentFrame.eraserTool = false;
    m_currentFrame.penTool = false;
}

EvdevMarkerSource::~EvdevMarkerSource() {
    if (m_fd >= 0) {
        if (m_grabbed) {
            ioctl(m_fd, EVIOCGRAB, (void*)0);
        }
        close(m_fd);
    }
}

bool EvdevMarkerSource::start(QString* errorOut) {
    m_fd = open(m_devicePath.toStdString().c_str(), O_RDONLY | O_NONBLOCK);
    if (m_fd < 0) {
        const QString err = QStringLiteral("open(%1) failed").arg(m_devicePath);
        PerfLog::instance().log("MARKER_OPEN_FAILED", {{"device", m_devicePath}});
        if (errorOut) *errorOut = err;
        return false;
    }
    PerfLog::instance().log("MARKER_OPENED", {{"device", m_devicePath}});

    if (ioctl(m_fd, EVIOCGRAB, (void*)1) < 0) {
        PerfLog::instance().log("EVIOCGRAB_FAILED", {{"device", m_devicePath}});
        if (errorOut) *errorOut = QStringLiteral("EVIOCGRAB failed on %1 (device busy?)").arg(m_devicePath);
        close(m_fd);
        m_fd = -1;
        return false;
    }
    m_grabbed = true;
    PerfLog::instance().log("EVIOCGRAB_SUCCEEDED", {{"device", m_devicePath}});

    struct input_absinfo abs_x, abs_y, abs_p;
    bool okX = ioctl(m_fd, EVIOCGABS(ABS_X), &abs_x) >= 0;
    bool okY = ioctl(m_fd, EVIOCGABS(ABS_Y), &abs_y) >= 0;
    bool okP = ioctl(m_fd, EVIOCGABS(ABS_PRESSURE), &abs_p) >= 0;
    if (!okX || !okY || !okP) {
        PerfLog::instance().log("INPUT_RANGES_READ_FAILED",
                                {{"abs_x", okX}, {"abs_y", okY}, {"abs_pressure", okP}});
        if (errorOut) *errorOut = QStringLiteral("EVIOCGABS failed (x=%1 y=%2 p=%3)")
                                      .arg(okX).arg(okY).arg(okP);
        ioctl(m_fd, EVIOCGRAB, (void*)0);
        m_grabbed = false;
        close(m_fd);
        m_fd = -1;
        return false;
    }
    m_rangeX = {abs_x.minimum, abs_x.maximum};
    m_rangeY = {abs_y.minimum, abs_y.maximum};
    m_rangePressure = {abs_p.minimum, abs_p.maximum};
    PerfLog::instance().log("INPUT_RANGES_READ", {
        {"abs_x_min", m_rangeX.min}, {"abs_x_max", m_rangeX.max},
        {"abs_y_min", m_rangeY.min}, {"abs_y_max", m_rangeY.max},
        {"abs_pressure_min", m_rangePressure.min}, {"abs_pressure_max", m_rangePressure.max},
        {"screen_width", m_screenWidth}, {"screen_height", m_screenHeight},
    });
    qWarning() << "Marker evdev initialized. X:" << m_rangeX.min << ".." << m_rangeX.max
               << "Y:" << m_rangeY.min << ".." << m_rangeY.max
               << "P:" << m_rangePressure.min << ".." << m_rangePressure.max;

    m_notifier = new QSocketNotifier(m_fd, QSocketNotifier::Read, this);
    connect(m_notifier, &QSocketNotifier::activated, this, &EvdevMarkerSource::onReadyRead);
    return true;
}

static int mapAxis(int raw, const MarkerAbsRange& r, int screenExtent) {
    if (!r.valid()) return 0;
    long long mapped = (long long)(raw - r.min) * (screenExtent - 1) / (r.max - r.min);
    if (mapped < 0) mapped = 0;
    if (mapped > screenExtent - 1) mapped = screenExtent - 1;
    return (int)mapped;
}

int EvdevMarkerSource::mapX(int raw) const { return mapAxis(raw, m_rangeX, m_screenWidth); }
int EvdevMarkerSource::mapY(int raw) const { return mapAxis(raw, m_rangeY, m_screenHeight); }

bool EvdevMarkerSource::validateMapping(QString* detailOut) {
    PerfLog::instance().log("COORD_MAPPING_FORMULA", {
        {"x", QStringLiteral("mappedX = (rawX - %1) * (%2 - 1) / (%3 - %1)")
                  .arg(m_rangeX.min).arg(m_screenWidth).arg(m_rangeX.max)},
        {"y", QStringLiteral("mappedY = (rawY - %1) * (%2 - 1) / (%3 - %1)")
                  .arg(m_rangeY.min).arg(m_screenHeight).arg(m_rangeY.max)},
    });

    QStringList failures;
    if (!m_rangeX.valid()) failures << QStringLiteral("ABS_X range invalid (%1..%2)").arg(m_rangeX.min).arg(m_rangeX.max);
    if (!m_rangeY.valid()) failures << QStringLiteral("ABS_Y range invalid (%1..%2)").arg(m_rangeY.min).arg(m_rangeY.max);
    if (!m_rangePressure.valid()) failures << QStringLiteral("ABS_PRESSURE range invalid (%1..%2)").arg(m_rangePressure.min).arg(m_rangePressure.max);

    if (m_rangeX.valid() && m_rangeY.valid()) {
        const int x0 = mapX(m_rangeX.min);
        const int x1 = mapX(m_rangeX.max);
        const int y0 = mapY(m_rangeY.min);
        const int y1 = mapY(m_rangeY.max);
        const int cx = mapX((m_rangeX.min + m_rangeX.max) / 2);
        const int cy = mapY((m_rangeY.min + m_rangeY.max) / 2);
        if (x0 != 0) failures << QStringLiteral("raw X min maps to %1, expected 0").arg(x0);
        if (x1 != m_screenWidth - 1) failures << QStringLiteral("raw X max maps to %1, expected %2").arg(x1).arg(m_screenWidth - 1);
        if (y0 != 0) failures << QStringLiteral("raw Y min maps to %1, expected 0").arg(y0);
        if (y1 != m_screenHeight - 1) failures << QStringLiteral("raw Y max maps to %1, expected %2").arg(y1).arg(m_screenHeight - 1);
        if (cx <= 0 || cx >= m_screenWidth - 1) failures << QStringLiteral("raw X center maps to %1, not inside screen").arg(cx);
        if (cy <= 0 || cy >= m_screenHeight - 1) failures << QStringLiteral("raw Y center maps to %1, not inside screen").arg(cy);
    }

    const bool ok = failures.isEmpty();
    PerfLog::instance().log(ok ? "COORD_MAPPING_CHECK_PASS" : "COORD_MAPPING_CHECK_FAIL",
                            {{"failures", failures.join("; ")}});
    if (!ok && detailOut) *detailOut = failures.join("; ");
    return ok;
}

void EvdevMarkerSource::onReadyRead() {
    struct input_event ev;
    int ret;
    while ((ret = read(m_fd, &ev, sizeof(ev))) == sizeof(ev)) {
        if (ev.type == EV_ABS) {
            if (ev.code == ABS_X) {
                m_currentFrame.rawX = ev.value;
            } else if (ev.code == ABS_Y) {
                m_currentFrame.rawY = ev.value;
            } else if (ev.code == ABS_PRESSURE) {
                m_currentFrame.rawPressure = ev.value;
            }
        } else if (ev.type == EV_KEY) {
            if (ev.code == BTN_TOUCH) {
                m_currentFrame.touching = (ev.value != 0);
            } else if (ev.code == BTN_TOOL_RUBBER) {
                m_currentFrame.eraserTool = (ev.value != 0);
            } else if (ev.code == BTN_TOOL_PEN) {
                m_currentFrame.penTool = (ev.value != 0);
            }
        } else if (ev.type == EV_SYN && ev.code == SYN_REPORT) {
            if (!m_acceptInput) continue;

            struct timespec ts;
            clock_gettime(CLOCK_MONOTONIC_RAW, &ts);
            m_currentFrame.kernelNs = ev.time.tv_sec * 1000000000ULL + ev.time.tv_usec * 1000ULL;
            m_currentFrame.readNs = ts.tv_sec * 1000000000ULL + ts.tv_nsec;
            m_currentFrame.monotonicNs = m_currentFrame.readNs;

            m_currentFrame.mappedX = mapX(m_currentFrame.rawX);
            m_currentFrame.mappedY = mapY(m_currentFrame.rawY);

            if (m_currentFrame.touching && !m_firstContactSeen) {
                m_firstContactSeen = true;
                PerfLog::instance().log("FIRST_MARKER_FRAME", {
                    {"raw_x", m_currentFrame.rawX}, {"raw_y", m_currentFrame.rawY},
                    {"mapped_x", m_currentFrame.mappedX}, {"mapped_y", m_currentFrame.mappedY},
                    {"pressure", m_currentFrame.rawPressure},
                });
                emit firstContact();
            }

            if (frameFilter && frameFilter(m_currentFrame)) continue;

            DisplayScheduler::instance().penDown = m_currentFrame.touching;
            m_pipeline.consumeFrame(m_currentFrame);
            DisplayScheduler::instance().tick(m_currentFrame.monotonicNs);
        }
    }
    if (ret > 0 && ret != sizeof(ev)) {
        qWarning() << "Partial read from evdev:" << ret;
    }
}
