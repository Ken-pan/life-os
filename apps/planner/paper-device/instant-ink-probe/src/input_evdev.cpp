#include "input_evdev.h"
#include <linux/input.h>
#include <fcntl.h>
#include <unistd.h>
#include <iostream>

void run_evdev_loop(const char* device, std::function<void(const MarkerEvent&)> callback) {
    int fd = open(device, O_RDONLY);
    if (fd < 0) {
        std::cerr << "Failed to open " << device << std::endl;
        return;
    }

    MarkerEvent current_state;
    struct input_event ev;

    while (read(fd, &ev, sizeof(ev)) == sizeof(ev)) {
        if (ev.type == EV_ABS) {
            if (ev.code == ABS_X) current_state.x = ev.value;
            else if (ev.code == ABS_Y) current_state.y = ev.value;
            else if (ev.code == ABS_PRESSURE) current_state.pressure = ev.value;
        } else if (ev.type == EV_KEY) {
            if (ev.code == BTN_TOUCH) current_state.pen_down = (ev.value != 0);
            else if (ev.code == BTN_TOOL_RUBBER) current_state.eraser = (ev.value != 0);
        } else if (ev.type == EV_SYN) {
            callback(current_state);
        }
    }
    close(fd);
}
