#pragma once
#include <QImage>
#include <QRect>

class InkRaster {
public:
    InkRaster(QImage* fb);
    void clearWhite();
    QRect fillRect(const QRect& rect, bool is_eraser);
    QRect drawRect(const QRect& rect, int radius, bool is_eraser);
    QRect drawLine(int x0, int y0, int x1, int y1, int radius, bool is_eraser);
private:
    void drawCircle(int cx, int cy, int radius, bool is_eraser, QRect& dirty);
    QImage* m_fb;
};
