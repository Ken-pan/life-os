#pragma once
#include <QRect>
#include <cstdint>

struct PenFrame {
    uint64_t monotonicNs;
    uint64_t kernelNs = 0;
    uint64_t readNs = 0;
    int rawX;
    int rawY;
    int mappedX;
    int mappedY;
    int rawPressure;
    int rawTiltX;
    int rawTiltY;
    bool touching;
    bool penTool;
    bool eraserTool;
    bool sideButton;
};

// Session tool state, set by the ink-mode toolbar. nib is the radius at full
// pressure; colored strokes get a Color-waveform settle swap on pen-up.
struct InkToolState {
    uint32_t color = 0xFF111111;
    int nib = 4;
    bool eraser = false;
};
extern InkToolState g_inkTool;

class PenPipeline {
public:
    void consumeFrame(const PenFrame &frame);

private:
    bool m_firstRasterLogged = false;
    // Stroke continuity: consecutive touching frames are joined with a line
    // segment; isolated per-frame dots turn fast strokes into dashes.
    bool m_wasTouching = false;
    int m_lastX = 0;
    int m_lastY = 0;
    int m_strokeId = 0;
    int m_segmentIndex = 0;
    bool m_strokeColored = false;
    QRect m_strokeBounds;
};
