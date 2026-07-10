#include "PenInputService.h"
#include "InkCanvasItem.h"
#include "PaperOsPaths.h"
#include "metrics.h"

#include <QFile>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QJsonObject>
#include <QMouseEvent>
#include <QQuickWindow>
#include <QSocketNotifier>
#include <QDebug>

#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/input.h>

PenInputService::PenInputService(QObject *parent) : QObject(parent)
{
    openDevice();
}

PenInputService::~PenInputService()
{
    if (m_fd >= 0)
        ::close(m_fd);
}

// Resolve the pen node by device name so a kernel update that renumbers
// event nodes cannot silently break pen input.
QString PenInputService::findPenDevice() const
{
    QFile procFile(QStringLiteral("/proc/bus/input/devices"));
    if (!procFile.open(QIODevice::ReadOnly))
        return QString();

    // procfs files report size 0, so QFile::atEnd()/readLine() loops end
    // immediately — read the whole file and split instead.
    const QStringList lines = QString::fromUtf8(procFile.readAll()).split('\n');
    QString currentName;
    for (const QString &rawLine : lines) {
        const QString line = rawLine.trimmed();
        if (line.startsWith("N: Name=")) {
            currentName = line.mid(8).remove('"').toLower();
        } else if (line.startsWith("H: Handlers=") && currentName.contains("marker")) {
            for (const QString &handler : line.mid(12).split(' ', Qt::SkipEmptyParts)) {
                if (handler.startsWith("event"))
                    return QStringLiteral("/dev/input/") + handler;
            }
        }
    }
    return QString();
}

void PenInputService::openDevice()
{
    const QString path = qEnvironmentVariable("PAPEROS_PEN_DEVICE", findPenDevice());
    if (path.isEmpty()) {
        qWarning() << "PaperOS pen: no marker input device found — pen disabled, touch still works";
        m_calibrationInfo = QStringLiteral("pen device not found");
        return;
    }

    m_fd = ::open(path.toLocal8Bit().constData(), O_RDONLY | O_NONBLOCK | O_CLOEXEC);
    if (m_fd < 0) {
        qWarning() << "PaperOS pen: cannot open" << path << "- pen disabled";
        m_calibrationInfo = QStringLiteral("cannot open ") + path;
        return;
    }

    auto readAxis = [this](int code, Axis &axis) {
        input_absinfo info{};
        if (ioctl(m_fd, EVIOCGABS(code), &info) == 0 && info.maximum > info.minimum) {
            axis.min = info.minimum;
            axis.max = info.maximum;
        }
    };
    readAxis(ABS_X, m_axisX);
    readAxis(ABS_Y, m_axisY);
    readAxis(ABS_PRESSURE, m_axisPressure);
    readAxis(ABS_DISTANCE, m_axisDistance);

    // Default orientation guess: the sibling touch controller is portrait-
    // native on chiappa (x 0-1248, y 0-2208 → 954x1696 with no rotation),
    // so start with a straight linear map and let pen_calib.json override.
    m_swapXY = false;
    m_invertX = false;
    m_invertY = false;
    loadCalibrationOverrides();

    m_calibrationInfo = QStringLiteral("%1 · x %2..%3 · y %4..%5 · p %6..%7 · swap=%8 invX=%9 invY=%10")
        .arg(path)
        .arg(m_axisX.min).arg(m_axisX.max)
        .arg(m_axisY.min).arg(m_axisY.max)
        .arg(m_axisPressure.min).arg(m_axisPressure.max)
        .arg(m_swapXY).arg(m_invertX).arg(m_invertY);
    qInfo() << "PaperOS pen:" << m_calibrationInfo;

    m_notifier = new QSocketNotifier(m_fd, QSocketNotifier::Read, this);
    connect(m_notifier, &QSocketNotifier::activated, this, &PenInputService::readPending);
    emit availableChanged();
}

void PenInputService::loadCalibrationOverrides()
{
    QFile file(paperosHome() + QStringLiteral("/pen_calib.json"));
    if (!file.open(QIODevice::ReadOnly))
        return;
    const QJsonObject obj = QJsonDocument::fromJson(file.readAll()).object();
    if (obj.contains("swapXY")) m_swapXY = obj["swapXY"].toBool();
    if (obj.contains("invertX")) m_invertX = obj["invertX"].toBool();
    if (obj.contains("invertY")) m_invertY = obj["invertY"].toBool();
    qInfo() << "PaperOS pen: calibration overrides loaded from pen_calib.json";
}

QPointF PenInputService::mapToScreen() const
{
    float nx = float(m_rawX - m_axisX.min) / float(m_axisX.max - m_axisX.min);
    float ny = float(m_rawY - m_axisY.min) / float(m_axisY.max - m_axisY.min);
    nx = qBound(0.0f, nx, 1.0f);
    ny = qBound(0.0f, ny, 1.0f);

    if (m_swapXY)
        std::swap(nx, ny);
    if (m_invertX)
        nx = 1.0f - nx;
    if (m_invertY)
        ny = 1.0f - ny;

    const QSizeF screen = m_window ? QSizeF(m_window->size()) : QSizeF(954, 1696);
    return QPointF(nx * (screen.width() - 1), ny * (screen.height() - 1));
}

void PenInputService::readPending()
{
    input_event events[64];
    for (;;) {
        const ssize_t bytes = ::read(m_fd, events, sizeof(events));
        if (bytes <= 0)
            break;

        const int count = int(bytes / sizeof(input_event));
        for (int i = 0; i < count; ++i) {
            const input_event &ev = events[i];
            switch (ev.type) {
            case EV_KEY:
                if (ev.code == BTN_TOOL_PEN)    m_toolPen = (ev.value != 0);
                if (ev.code == BTN_TOOL_RUBBER) m_toolRubber = (ev.value != 0);
                if (ev.code == BTN_TOUCH)       m_touching = (ev.value != 0);
                m_frameDirty = true;
                break;
            case EV_ABS:
                if (ev.code == ABS_X)        m_rawX = ev.value;
                if (ev.code == ABS_Y)        m_rawY = ev.value;
                if (ev.code == ABS_PRESSURE) m_rawPressure = ev.value;
                m_frameDirty = true;
                break;
            case EV_SYN:
                if (ev.code == SYN_DROPPED) {
                    // Kernel dropped events: our state is unreliable until
                    // the next full frame. Cancel any in-progress contact.
                    m_desynced = true;
                    if (m_wasTouching)
                        injectMouse(mapToScreen(), false, true);
                    m_wasTouching = false;
                    m_touching = false;
                    m_frameDirty = false;
                } else if (ev.code == SYN_REPORT) {
                    if (m_desynced) {
                        m_desynced = false;
                        m_frameDirty = false;
                    } else if (m_frameDirty) {
                        dispatchFrame();
                        m_frameDirty = false;
                    }
                }
                break;
            default:
                break;
            }
        }
    }
}

void PenInputService::dispatchFrame()
{
    m_pressureNorm = float(m_rawPressure - m_axisPressure.min)
        / float(m_axisPressure.max - m_axisPressure.min);
    m_pressureNorm = qBound(0.0, m_pressureNorm, 1.0);

    const QPointF pos = mapToScreen();

    if (m_touching && !m_wasTouching) {
        QJsonObject extra;
        extra["x"] = pos.x();
        extra["y"] = pos.y();
        extra["pressure"] = m_pressureNorm;
        Metrics::logEvent("pen-down", extra);

        if (m_downLogBudget > 0) {
            // Calibration aid: compare these against where the pen actually
            // touched to derive pen_calib.json swap/invert overrides.
            qInfo() << "PaperOS pen down at raw(" << m_rawX << "," << m_rawY
                    << ") -> screen" << pos;
            --m_downLogBudget;
        }
        // Ink fast path first: a stroke starting on a visible, enabled ink
        // canvas bypasses mouse synthesis entirely.
        m_inkStroke = false;
        if (m_inkTarget && m_inkTarget->isVisible() && m_inkTarget->captureEnabled()) {
            const QPointF itemPos = m_inkTarget->mapFromScene(pos);
            if (m_inkTarget->contains(itemPos)) {
                m_inkStroke = true;
                m_inkTarget->penDown(itemPos, m_pressureNorm, m_toolRubber);
            }
        }
        if (!m_inkStroke) {
            m_lastInjected = pos;
            injectMouse(pos, true, false);
        }
    } else if (!m_touching && m_wasTouching) {
        QJsonObject extra;
        extra["x"] = pos.x();
        extra["y"] = pos.y();
        Metrics::logEvent("pen-up", extra);

        if (m_inkStroke) {
            if (m_inkTarget)
                m_inkTarget->penUp();
            m_inkStroke = false;
        } else {
            injectMouse(pos, false, true);
        }
    } else if (m_touching) {
        QJsonObject extra;
        extra["x"] = pos.x();
        extra["y"] = pos.y();
        extra["pressure"] = m_pressureNorm;
        Metrics::logEvent("pen-move", extra);

        if (m_inkStroke) {
            if (m_inkTarget)
                m_inkTarget->penMove(m_inkTarget->mapFromScene(pos), m_pressureNorm);
        } else if ((pos - m_lastInjected).manhattanLength() >= 3.0) {
            // Motion filter for synthesized mouse moves — UI taps/drags
            // don't need 200 Hz delivery.
            m_lastInjected = pos;
            injectMouse(pos, false, false);
        }
    }
    m_wasTouching = m_touching;

    // Notify QML only on discrete transitions (tool / touch / range) —
    // pressure is read imperatively during strokes. Binding this signal
    // to per-frame updates repainted half the UI at pen rate.
    const bool inRange = penInRange();
    if (m_touching != m_notifiedTouching || m_toolRubber != m_notifiedRubber
        || inRange != m_notifiedInRange) {
        m_notifiedTouching = m_touching;
        m_notifiedRubber = m_toolRubber;
        m_notifiedInRange = inRange;
        emit penStateChanged();
    }
}

void PenInputService::setInkTarget(QObject *target)
{
    m_inkTarget = qobject_cast<InkCanvasItem *>(target);
    if (target && !m_inkTarget)
        qWarning() << "PaperOS pen: setInkTarget got a non-InkCanvasItem object";
}

void PenInputService::injectMouse(const QPointF &pos, bool down, bool up)
{
    if (!m_window)
        return;

    QEvent::Type type = QEvent::MouseMove;
    Qt::MouseButton button = Qt::NoButton;
    Qt::MouseButtons buttons = Qt::LeftButton;

    if (down) {
        type = QEvent::MouseButtonPress;
        button = Qt::LeftButton;
    } else if (up) {
        type = QEvent::MouseButtonRelease;
        button = Qt::LeftButton;
        buttons = Qt::NoButton;
    }

    QMouseEvent event(type, pos, pos, m_window->mapToGlobal(pos.toPoint()),
                      button, buttons, Qt::NoModifier);
    QGuiApplication::sendEvent(m_window, &event);
}
