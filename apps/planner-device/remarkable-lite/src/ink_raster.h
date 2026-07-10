#pragma once
#include <QImage>
#include <QRect>
#include <cstdint>

class InkRaster {
public:
    InkRaster(QImage* fb);
    void clearWhite();
    QRect drawLine(int x0, int y0, int x1, int y1, int radius, bool is_eraser,
                   uint32_t color = 0xFF000000);
private:
    void drawCircle(int cx, int cy, int radius, bool is_eraser, uint32_t color, QRect& dirty);
    QImage* m_fb;
};
