#include "ink_raster.h"
#include <algorithm>
#include <cmath>

InkRaster::InkRaster(QImage* fb) : m_fb(fb) {}

void InkRaster::clearWhite() {
    if (!m_fb) return;
    if (m_fb->format() == QImage::Format_RGB32) {
        m_fb->fill(0xFFFFFFFF);
    } else if (m_fb->format() == QImage::Format_Grayscale8) {
        m_fb->fill(0xFF);
    }
}

QRect InkRaster::fillRect(const QRect& rect, bool is_eraser) {
    if (!m_fb) return QRect();
    const QRect bounds = rect.intersected(QRect(0, 0, m_fb->width(), m_fb->height()));
    if (bounds.isNull()) return QRect();

    uint32_t color32 = is_eraser ? 0xFFFFFFFF : 0xFF000000;
    uint8_t color8 = is_eraser ? 0xFF : 0x00;
    for (int y = bounds.top(); y <= bounds.bottom(); ++y) {
        if (m_fb->format() == QImage::Format_RGB32) {
            uint32_t* line = (uint32_t*)m_fb->scanLine(y);
            for (int x = bounds.left(); x <= bounds.right(); ++x) line[x] = color32;
        } else if (m_fb->format() == QImage::Format_Grayscale8) {
            uint8_t* line = (uint8_t*)m_fb->scanLine(y);
            for (int x = bounds.left(); x <= bounds.right(); ++x) line[x] = color8;
        }
    }
    return bounds;
}

QRect InkRaster::drawRect(const QRect& rect, int radius, bool is_eraser) {
    QRect dirty;
    dirty = dirty.united(drawLine(rect.left(), rect.top(), rect.right(), rect.top(), radius, is_eraser));
    dirty = dirty.united(drawLine(rect.right(), rect.top(), rect.right(), rect.bottom(), radius, is_eraser));
    dirty = dirty.united(drawLine(rect.right(), rect.bottom(), rect.left(), rect.bottom(), radius, is_eraser));
    dirty = dirty.united(drawLine(rect.left(), rect.bottom(), rect.left(), rect.top(), radius, is_eraser));
    return dirty;
}

void InkRaster::drawCircle(int cx, int cy, int radius, bool is_eraser, QRect& dirty) {
    if (!m_fb) return;
    int w = m_fb->width();
    int h = m_fb->height();
    int xmin = std::max(0, cx - radius);
    int xmax = std::min(w - 1, cx + radius);
    int ymin = std::max(0, cy - radius);
    int ymax = std::min(h - 1, cy + radius);
    
    int r2 = radius * radius;
    uint32_t color32 = is_eraser ? 0xFFFFFFFF : 0xFF000000;
    uint8_t color8 = is_eraser ? 0xFF : 0x00;

    for (int y = ymin; y <= ymax; y++) {
        int dy = y - cy;
        int dy2 = dy * dy;
        if (m_fb->format() == QImage::Format_RGB32) {
            uint32_t* line = (uint32_t*)m_fb->scanLine(y);
            for (int x = xmin; x <= xmax; x++) {
                int dx = x - cx;
                if (dx * dx + dy2 <= r2) line[x] = color32;
            }
        } else if (m_fb->format() == QImage::Format_Grayscale8) {
            uint8_t* line = (uint8_t*)m_fb->scanLine(y);
            for (int x = xmin; x <= xmax; x++) {
                int dx = x - cx;
                if (dx * dx + dy2 <= r2) line[x] = color8;
            }
        }
    }
    
    if (xmin <= xmax && ymin <= ymax) {
        QRect rect(xmin, ymin, xmax - xmin + 1, ymax - ymin + 1);
        if (dirty.isNull()) dirty = rect;
        else dirty = dirty.united(rect);
    }
}

QRect InkRaster::drawLine(int x0, int y0, int x1, int y1, int radius, bool is_eraser) {
    QRect dirty;
    int dx = std::abs(x1 - x0);
    int dy = std::abs(y1 - y0);
    int sx = x0 < x1 ? 1 : -1;
    int sy = y0 < y1 ? 1 : -1;
    int err = (dx > dy ? dx : -dy) / 2;

    while (true) {
        drawCircle(x0, y0, radius, is_eraser, dirty);
        if (x0 == x1 && y0 == y1) break;
        int e2 = err;
        if (e2 > -dx) { err -= dy; x0 += sx; }
        if (e2 < dy) { err += dx; y0 += sy; }
    }
    return dirty;
}
