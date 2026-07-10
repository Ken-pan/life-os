#include "DisplayScheduler.h"
#include "../PerfLog.h"
#include <QJsonObject>
#include <QJsonArray>
#include <QThread>

DisplayScheduler& DisplayScheduler::instance() {
    static DisplayScheduler inst;
    return inst;
}

void DisplayScheduler::addDirty(const QRect &rect) {
    if (pendingDirty.isNull()) pendingDirty = rect;
    else pendingDirty = pendingDirty.united(rect);
}

void DisplayScheduler::tick(uint64_t nowNs) {
    if (pendingDirty.isEmpty()) return;
    if (nowNs - lastSwapNs < minimumSwapIntervalNs) return;

    QRect rect = pendingDirty;
    pendingDirty = QRect();

    QJsonObject updateEvent;
    updateEvent["ts_ns"] = static_cast<qint64>(nowNs);
    updateEvent["thread_id"] = static_cast<qint64>(reinterpret_cast<quintptr>(QThread::currentThreadId()));
    updateEvent["rect"] = QJsonArray{rect.x(), rect.y(), rect.width(), rect.height()};
    updateEvent["rect_area"] = rect.width() * rect.height();
    updateEvent["full_refresh"] = (rect.width() >= 900 && rect.height() >= 1600);
    updateEvent["pen_down"] = penDown;
    updateEvent["ms_since_previous_update"] = (nowNs - lastSwapNs) / 1000000.0;

    PerfLog::instance().log("WINDOW_UPDATE_REQUEST", updateEvent);
    if (penDown && !m_firstStrokeUpdateLogged) {
        m_firstStrokeUpdateLogged = true;
        PerfLog::instance().log("FIRST_UPDATE_REQUEST", updateEvent);
    }

    if (presenter) {
        presenter(rect);
    }

    PerfLog::instance().log("WINDOW_UPDATE_RETURN", updateEvent);

    lastSwapNs = nowNs;
}
