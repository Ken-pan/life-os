#pragma once
#include <QRect>
#include <cstdint>
#include <functional>

class DisplayScheduler {
public:
    static DisplayScheduler& instance();

    void addDirty(const QRect &rect);
    void tick(uint64_t nowNs);

    bool penDown = false;

    // How a coalesced dirty rect reaches the panel: the raster-qpa target
    // updates its QRasterWindow, the live takeover target issues a direct
    // EPFramebuffer swap.
    std::function<void(const QRect&)> presenter;

    // Pen-up color development for colored strokes (Color waveform swap).
    std::function<void(const QRect&)> settlePresenter;
    void settle(const QRect& rect) { if (settlePresenter) settlePresenter(rect); }

private:
    DisplayScheduler() = default;
    QRect pendingDirty;
    uint64_t lastSwapNs = 0;
    bool m_firstStrokeUpdateLogged = false;
    const uint64_t minimumSwapIntervalNs = 8000000ULL; // 8ms
};
