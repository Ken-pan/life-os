#include "PenPipeline.h"
#include "DisplayScheduler.h"
#include "../epframebuffer.h"
#include "../ink_raster.h"
#include "../PerfLog.h"
#include <QJsonObject>
#include <QJsonArray>
#include <QRect>
#include <time.h>
#include <cstdlib>

extern QImage* g_inkGoldBuffer;

InkToolState g_inkTool;

// Pressure-sensitive nib: raw pressure 0..4096 sweeps 1..nib px radius.
// The eraser stamps a wide fixed nib.
static int radiusForPressure(int pressure, bool eraser) {
    if (eraser) return 14;
    if (pressure <= 0) return 1;
    const int nib = g_inkTool.nib > 0 ? g_inkTool.nib : 4;
    int r = 1 + (pressure * (nib - 1)) / 4096;
    return r > nib ? nib : r;
}

void PenPipeline::consumeFrame(const PenFrame &frame) {
    if (!g_inkGoldBuffer) return;

    QJsonObject synEvent;
    synEvent["ts_ns"] = static_cast<qint64>(frame.monotonicNs);
    if (frame.kernelNs > 0) {
        synEvent["kernel_ts_ns"] = static_cast<qint64>(frame.kernelNs);
        synEvent["read_ts_ns"] = static_cast<qint64>(frame.readNs);
    }
    synEvent["stroke_id"] = 0; // TODO
    synEvent["frame_index"] = 0; // TODO
    synEvent["raw_x"] = frame.rawX;
    synEvent["raw_y"] = frame.rawY;
    synEvent["mapped_x"] = frame.mappedX;
    synEvent["mapped_y"] = frame.mappedY;
    synEvent["pressure"] = frame.rawPressure;
    synEvent["touching"] = frame.touching;
    synEvent["eraser"] = frame.eraserTool;
    PerfLog::instance().log("PEN_SYN_FRAME", synEvent);

    if (frame.touching) {
        struct timespec ts_start;
        clock_gettime(CLOCK_MONOTONIC_RAW, &ts_start);

        // Join consecutive frames of a stroke; a pen-down frame with no
        // predecessor starts the stroke with a single stamp.
        const int x0 = m_wasTouching ? m_lastX : frame.mappedX;
        const int y0 = m_wasTouching ? m_lastY : frame.mappedY;
        if (!m_wasTouching) {
            ++m_strokeId;
            m_segmentIndex = 0;
        }
        const bool eraser = frame.eraserTool || g_inkTool.eraser;
        const int radius = radiusForPressure(frame.rawPressure, eraser);
        InkRaster raster(g_inkGoldBuffer);
        QRect dirty = raster.drawLine(x0, y0, frame.mappedX, frame.mappedY, radius, eraser,
                                      g_inkTool.color);
        m_lastX = frame.mappedX;
        m_lastY = frame.mappedY;
        m_wasTouching = true;
        const uint32_t rgb = g_inkTool.color & 0x00FFFFFF;
        if (!eraser && rgb != 0x000000 && rgb != 0x111111)
            m_strokeColored = true;
        m_strokeBounds = m_strokeBounds.isNull() ? dirty : m_strokeBounds.united(dirty);

        struct timespec ts_end;
        clock_gettime(CLOCK_MONOTONIC_RAW, &ts_end);
        qint64 durUs = (ts_end.tv_sec - ts_start.tv_sec)*1000000LL + (ts_end.tv_nsec - ts_start.tv_nsec)/1000;

        const int distPx = std::abs(frame.mappedX - x0) + std::abs(frame.mappedY - y0);
        QJsonObject rasterEvent;
        rasterEvent["ts_ns"] = static_cast<qint64>(frame.monotonicNs);
        rasterEvent["stroke_id"] = m_strokeId;
        rasterEvent["segment_index"] = m_segmentIndex++;
        rasterEvent["duration_us"] = durUs;
        rasterEvent["interpolation_steps"] = 1;
        rasterEvent["segment_distance_px"] = distPx;
        rasterEvent["radius"] = radius;
        rasterEvent["dirty_rect"] = QJsonArray{dirty.x(), dirty.y(), dirty.width(), dirty.height()};
        PerfLog::instance().log("RASTER_END", rasterEvent);

        if (!m_firstRasterLogged) {
            m_firstRasterLogged = true;
            PerfLog::instance().log("FIRST_RASTER_COMPLETE", rasterEvent);
        }

        DisplayScheduler::instance().addDirty(dirty);
    } else {
        if (m_wasTouching && m_strokeColored && !m_strokeBounds.isNull()) {
            // Draft strokes render via the fast mono waveform; develop the
            // true ink color once per stroke on pen-up.
            DisplayScheduler::instance().settle(m_strokeBounds);
        }
        m_strokeBounds = QRect();
        m_strokeColored = false;
        m_wasTouching = false;
    }
}
