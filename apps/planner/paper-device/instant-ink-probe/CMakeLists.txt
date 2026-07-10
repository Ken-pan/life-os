cmake_minimum_required(VERSION 3.16)
project(paperos-ink-probe VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui)

qt_standard_project_setup(REQUIRES 6.5)

qt_add_executable(paperos-ink-probe
    src/main.cpp
    src/epfb.cpp
    src/ink_raster.cpp
    src/input_evdev.cpp
)

target_link_libraries(paperos-ink-probe
    PRIVATE
    Qt6::Core
    Qt6::Gui
)
