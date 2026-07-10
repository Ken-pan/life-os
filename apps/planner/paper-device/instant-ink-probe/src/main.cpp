#include <QCoreApplication>
#include <iostream>
#include <thread>
#include <mutex>
#include <chrono>
#include <cstdint>
#include <fstream>
#include <atomic>
#include <vector>
#include <algorithm>
#include <cmath>
#include <functional>
#include <string>
#include "epframebuffer.h"
#include "ink_raster.h"
#include "input_evdev.h"

struct ProbeConfig {
    int flush_ms = 8;
    int duration_sec = 30;
    int screen_mode = 0; // Quill live baseline: mode 0
    int content_type = 0; // Mono
    const char* input_device = "/dev/input/event2";
};

std::mutex g_mutex;
QRect g_dirty_rect;
MarkerEvent g_last_event;
bool g_has_last = false;
std::atomic<bool> g_running(true);
std::atomic<int> g_pending_raster_frames(0);
std::atomic<bool> g_pen_down(false);
std::atomic<bool> g_startup_done(false);

uint64_t now_ms() {
    using namespace std::chrono;
    return duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
}

uint64_t now_ns() {
    using namespace std::chrono;
    return duration_cast<nanoseconds>(steady_clock::now().time_since_epoch()).count();
}

static const uint8_t* glyph(char c) {
    static const uint8_t blank[7] = {0,0,0,0,0,0,0};
    static const uint8_t A[7] = {14,17,17,31,17,17,17};
    static const uint8_t B[7] = {30,17,17,30,17,17,30};
    static const uint8_t C[7] = {14,17,16,16,16,17,14};
    static const uint8_t D[7] = {30,17,17,17,17,17,30};
    static const uint8_t E[7] = {31,16,16,30,16,16,31};
    static const uint8_t F[7] = {31,16,16,30,16,16,16};
    static const uint8_t G[7] = {14,17,16,23,17,17,14};
    static const uint8_t H[7] = {17,17,17,31,17,17,17};
    static const uint8_t I[7] = {14,4,4,4,4,4,14};
    static const uint8_t K[7] = {17,18,20,24,20,18,17};
    static const uint8_t L[7] = {16,16,16,16,16,16,31};
    static const uint8_t M[7] = {17,27,21,21,17,17,17};
    static const uint8_t N[7] = {17,25,21,19,17,17,17};
    static const uint8_t O[7] = {14,17,17,17,17,17,14};
    static const uint8_t P[7] = {30,17,17,30,16,16,16};
    static const uint8_t R[7] = {30,17,17,30,20,18,17};
    static const uint8_t S[7] = {15,16,16,14,1,1,30};
    static const uint8_t T[7] = {31,4,4,4,4,4,4};
    static const uint8_t U[7] = {17,17,17,17,17,17,14};
    static const uint8_t V[7] = {17,17,17,17,17,10,4};
    static const uint8_t Y[7] = {17,17,10,4,4,4,4};
    static const uint8_t zero[7] = {14,17,19,21,25,17,14};
    static const uint8_t eight[7] = {14,17,17,14,17,17,14};
    static const uint8_t colon[7] = {0,4,4,0,4,4,0};
    switch (c) {
        case 'A': return A; case 'B': return B; case 'C': return C; case 'D': return D;
        case 'E': return E; case 'F': return F; case 'G': return G; case 'H': return H;
        case 'I': return I; case 'K': return K; case 'L': return L; case 'M': return M;
        case 'N': return N; case 'O': return O; case 'P': return P; case 'R': return R;
        case 'S': return S; case 'T': return T; case 'U': return U; case 'V': return V;
        case 'Y': return Y; case '0': return zero; case '8': return eight; case ':': return colon;
        default: return blank;
    }
}

static QRect draw_text(InkRaster& raster, int x, int y, const std::string& text, int scale) {
    QRect dirty;
    int cursor = x;
    for (char c : text) {
        const uint8_t* rows = glyph(c);
        for (int row = 0; row < 7; ++row) {
            for (int col = 0; col < 5; ++col) {
                if (rows[row] & (1 << (4 - col)))
                    dirty = dirty.united(raster.fillRect(QRect(cursor + col * scale, y + row * scale, scale, scale), false));
            }
        }
        cursor += 6 * scale;
    }
    return dirty;
}

static QRect draw_header(InkRaster& raster, int width) {
    QRect dirty;
    dirty = dirty.united(raster.fillRect(QRect(0, 0, width, 190), true));
    dirty = dirty.united(draw_text(raster, 32, 22, "PAPEROS GOLD INK BASELINE", 3));
    dirty = dirty.united(draw_text(raster, 32, 58, "TAKEOVER: YES", 3));
    dirty = dirty.united(draw_text(raster, 32, 94, "MODE: 0", 3));
    dirty = dirty.united(draw_text(raster, 32, 130, "FULL REFRESH DURING INK: NO", 3));
    dirty = dirty.united(draw_text(raster, 32, 166, "FLUSH TARGET: 8MS", 3));
    dirty = dirty.united(raster.drawLine(0, 189, width - 1, 189, 1, false));
    return dirty;
}

struct Metrics {
    uint64_t total_marker_frames = 0;
    uint64_t total_rasterized_segments = 0;
    uint64_t total_swaps = 0;
    uint64_t pen_down_full_refresh_count = 0;
    uint64_t pen_down_fullscreen_swap_count = 0;
    uint64_t concurrent_swap_count = 0;
    uint64_t swap_intervals_below_6ms = 0;
    uint64_t largest_dirty_rect_area = 0;
    int largest_dirty_rect_w = 0;
    int largest_dirty_rect_h = 0;
    int largest_pending_segment_batch = 0;
    uint64_t previous_swap_ns = 0;
    std::vector<double> swap_intervals_ms;
    std::vector<double> swap_durations_ms;
};

static double percentile(std::vector<double> values, double p) {
    if (values.empty()) return 0.0;
    std::sort(values.begin(), values.end());
    const double idx = (values.size() - 1) * p;
    const size_t lo = size_t(std::floor(idx));
    const size_t hi = size_t(std::ceil(idx));
    if (lo == hi) return values[lo];
    return values[lo] + (values[hi] - values[lo]) * (idx - lo);
}

static uint64_t thread_id_hash() {
    return std::hash<std::thread::id>{}(std::this_thread::get_id());
}

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    
    ProbeConfig cfg;
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--flush-ms" && i + 1 < argc) cfg.flush_ms = std::stoi(argv[++i]);
        if (arg == "--duration-sec" && i + 1 < argc) cfg.duration_sec = std::stoi(argv[++i]);
        if (arg == "--screen-mode" && i + 1 < argc) cfg.screen_mode = std::stoi(argv[++i]);
        if (arg == "--content-type" && i + 1 < argc) cfg.content_type = std::stoi(argv[++i]);
        if (arg == "--device" && i + 1 < argc) cfg.input_device = argv[++i];
    }

    std::cout << "[GoldBaseline] QCoreApplication-only native ink probe" << std::endl;
    std::cout << "[GoldBaseline] live raster: per marker frame; display scheduler: "
              << cfg.flush_ms << "ms; content=Mono(" << cfg.content_type
              << "); mode=" << cfg.screen_mode << std::endl;
    EPFramebuffer* fb = EPFramebuffer::instance();
    if (!fb || !g_mainFramebuffer) {
        std::cerr << "[Probe] Failed to initialize EPFramebuffer!" << std::endl;
        return 1;
    }

    InkRaster raster(g_mainFramebuffer);
    raster.clearWhite();
    QRect initial_dirty = draw_header(raster, g_mainFramebuffer->width());

    std::ofstream log_file("/tmp/paperos-ink-probe-metrics.jsonl", std::ios::app);
    log_file << "{\"event\":\"start\",\"app\":\"paperos-ink-gold-baseline\","
             << "\"qcore_only\":true,\"flush_ms\":" << cfg.flush_ms
             << ",\"content_type\":" << cfg.content_type
             << ",\"screen_mode\":" << cfg.screen_mode
             << ",\"initial_dirty\":[" << initial_dirty.x() << "," << initial_dirty.y()
             << "," << initial_dirty.width() << "," << initial_dirty.height() << "]}\n";
    log_file.flush();

    Metrics metrics;
    std::atomic<bool> swap_active(false);

    std::thread display_thread([&]() {
        auto submit = [&](const QRect& rect, int mode, int content_type, int flags,
                          bool full_refresh, int pending_segments) {
            const bool pen_down = g_pen_down.load();
            if (swap_active.exchange(true))
                ++metrics.concurrent_swap_count;
            const uint64_t before_ns = now_ns();
            const uint64_t previous_ns = metrics.previous_swap_ns;
            const double ms_since_previous = previous_ns == 0 ? 0.0 : double(before_ns - previous_ns) / 1000000.0;
            if (previous_ns != 0) {
                metrics.swap_intervals_ms.push_back(ms_since_previous);
                if (ms_since_previous < 6.0)
                    ++metrics.swap_intervals_below_6ms;
            }

            fb->swapBuffers(rect, (EPContentType)content_type, (EPScreenMode)mode,
                            QFlags<EPFramebuffer::UpdateFlag>(flags));

            const uint64_t after_ns = now_ns();
            const double duration_ms = double(after_ns - before_ns) / 1000000.0;
            metrics.swap_durations_ms.push_back(duration_ms);
            metrics.previous_swap_ns = before_ns;
            ++metrics.total_swaps;
            const uint64_t area = uint64_t(rect.width()) * uint64_t(rect.height());
            if (area > metrics.largest_dirty_rect_area) {
                metrics.largest_dirty_rect_area = area;
                metrics.largest_dirty_rect_w = rect.width();
                metrics.largest_dirty_rect_h = rect.height();
            }
            if (pending_segments > metrics.largest_pending_segment_batch)
                metrics.largest_pending_segment_batch = pending_segments;
            const bool full_screen = rect.x() == 0 && rect.y() == 0
                && rect.width() >= g_mainFramebuffer->width()
                && rect.height() >= g_mainFramebuffer->height();
            if (pen_down && full_refresh)
                ++metrics.pen_down_full_refresh_count;
            if (pen_down && full_screen)
                ++metrics.pen_down_fullscreen_swap_count;

            log_file << "{\"event\":\"display_submit\""
                     << ",\"timestamp_ns\":" << before_ns
                     << ",\"thread_id\":" << thread_id_hash()
                     << ",\"rect\":{\"x\":" << rect.x()
                     << ",\"y\":" << rect.y()
                     << ",\"w\":" << rect.width()
                     << ",\"h\":" << rect.height() << "}"
                     << ",\"rect_area\":" << area
                     << ",\"mode\":" << mode
                     << ",\"content_type\":" << content_type
                     << ",\"flags\":" << flags
                     << ",\"full_refresh\":" << (full_refresh ? "true" : "false")
                     << ",\"pen_down\":" << (pen_down ? "true" : "false")
                     << ",\"ms_since_previous_swap\":" << ms_since_previous
                     << ",\"pending_segment_count\":" << pending_segments
                     << ",\"swap_duration_ms\":" << duration_ms
                     << "}\n";
            log_file.flush();
            swap_active = false;
        };

        submit(QRect(0, 0, g_mainFramebuffer->width(), g_mainFramebuffer->height()),
               int(EPScreenMode::HighQuality), int(EPContentType::Mono), 0, true, 0);
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
        g_startup_done = true;

        while (g_running) {
            uint64_t t0 = now_ms();
            QRect rect_to_swap;
            int pending_segments = 0;
            {
                std::lock_guard<std::mutex> lock(g_mutex);
                rect_to_swap = g_dirty_rect;
                g_dirty_rect = QRect();
                pending_segments = g_pending_raster_frames.exchange(0);
            }
            if (!rect_to_swap.isNull()) {
                const QRect padded = rect_to_swap.adjusted(-6, -6, 6, 6)
                    .intersected(QRect(0, 0, g_mainFramebuffer->width(), g_mainFramebuffer->height()));
                submit(padded, cfg.screen_mode, cfg.content_type, 0, false, pending_segments);
            }
            uint64_t elapsed = now_ms() - t0;
            if (elapsed < uint64_t(cfg.flush_ms))
                std::this_thread::sleep_for(std::chrono::milliseconds(cfg.flush_ms - elapsed));
        }
    });

    while (!g_startup_done)
        std::this_thread::sleep_for(std::chrono::milliseconds(10));

    std::thread ev_thread([&]() {
        run_evdev_loop(cfg.input_device, [&](const MarkerEvent& ev) {
            if (!g_running) return;
            std::lock_guard<std::mutex> lock(g_mutex);
            if (ev.x < 0 || ev.y < 0) return;
            ++metrics.total_marker_frames;
            
            // Move marker axes from Phase 2A: ABS_X 0..6760, ABS_Y 0..11960.
            int map_x = ev.x * g_mainFramebuffer->width() / 6760;
            int map_y = ev.y * g_mainFramebuffer->height() / 11960;
            const int header_bottom = 190;
            if (map_y < header_bottom) {
                g_has_last = false;
                g_pen_down = ev.pen_down;
                return;
            }
            
            if (ev.pen_down && ev.pressure > 0) {
                if (!g_has_last) {
                    g_last_event = ev;
                    g_last_event.x = map_x;
                    g_last_event.y = map_y;
                    g_has_last = true;
                } else {
                    QRect dirty = raster.drawLine(g_last_event.x, g_last_event.y, map_x, map_y, 2, ev.eraser);
                    g_dirty_rect = g_dirty_rect.united(dirty);
                    g_pending_raster_frames.fetch_add(1);
                    ++metrics.total_rasterized_segments;
                    g_last_event.x = map_x;
                    g_last_event.y = map_y;
                }
            } else {
                g_has_last = false;
            }
            g_pen_down = ev.pen_down;
        });
    });

    uint64_t start_time = now_ms();
    while (g_running) {
        if (now_ms() - start_time > uint64_t(cfg.duration_sec) * 1000) {
            g_running = false;
            break;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }

    g_running = false;
    display_thread.join();
    ev_thread.detach(); // blocked on read; process exit closes it
    log_file << "{\"event\":\"summary\""
             << ",\"total_marker_frames\":" << metrics.total_marker_frames
             << ",\"total_rasterized_segments\":" << metrics.total_rasterized_segments
             << ",\"total_swaps\":" << metrics.total_swaps
             << ",\"pen_down_full_refresh_count\":" << metrics.pen_down_full_refresh_count
             << ",\"pen_down_fullscreen_swap_count\":" << metrics.pen_down_fullscreen_swap_count
             << ",\"concurrent_swap_count\":" << metrics.concurrent_swap_count
             << ",\"swap_intervals_below_6ms\":" << metrics.swap_intervals_below_6ms
             << ",\"swap_interval_p50_ms\":" << percentile(metrics.swap_intervals_ms, 0.50)
             << ",\"swap_interval_p95_ms\":" << percentile(metrics.swap_intervals_ms, 0.95)
             << ",\"swap_interval_p99_ms\":" << percentile(metrics.swap_intervals_ms, 0.99)
             << ",\"swap_duration_p50_ms\":" << percentile(metrics.swap_durations_ms, 0.50)
             << ",\"swap_duration_p95_ms\":" << percentile(metrics.swap_durations_ms, 0.95)
             << ",\"swap_duration_p99_ms\":" << percentile(metrics.swap_durations_ms, 0.99)
             << ",\"largest_dirty_rect\":{\"area\":" << metrics.largest_dirty_rect_area
             << ",\"w\":" << metrics.largest_dirty_rect_w
             << ",\"h\":" << metrics.largest_dirty_rect_h << "}"
             << ",\"largest_pending_segment_batch\":" << metrics.largest_pending_segment_batch
             << ",\"assertions\":{\"pen_down_full_refresh_zero\":"
             << (metrics.pen_down_full_refresh_count == 0 ? "true" : "false")
             << ",\"pen_down_fullscreen_swaps_zero\":"
             << (metrics.pen_down_fullscreen_swap_count == 0 ? "true" : "false")
             << ",\"concurrent_swaps_zero\":"
             << (metrics.concurrent_swap_count == 0 ? "true" : "false")
             << ",\"swap_intervals_below_6ms_zero\":"
             << (metrics.swap_intervals_below_6ms == 0 ? "true" : "false")
             << "}}\n";
    log_file.flush();
    std::cout << "[GoldBaseline] Test completed." << std::endl;
    return 0;
}
