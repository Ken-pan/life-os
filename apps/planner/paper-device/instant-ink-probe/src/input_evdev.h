#pragma once
#include <functional>

struct MarkerEvent {
    int x = -1;
    int y = -1;
    int pressure = -1;
    bool pen_down = false;
    bool eraser = false;
};

void run_evdev_loop(const char* device, std::function<void(const MarkerEvent&)> callback);
