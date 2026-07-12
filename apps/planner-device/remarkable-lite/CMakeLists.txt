cmake_minimum_required(VERSION 3.16)
project(paperos VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Qml Quick Network)

qt_standard_project_setup(REQUIRES 6.5)

qt_add_executable(paperos
    src/main.cpp
    src/ApiClient.cpp
    src/ApiClient.h
    src/ActionQueue.cpp
    src/ActionQueue.h
    src/DeviceStatus.cpp
    src/DeviceStatus.h
    src/InkCanvasItem.cpp
    src/InkCanvasItem.h
    src/InkModeController.cpp
    src/InkModeController.h
    src/ink-gold/EvdevMarkerSource.cpp
    src/ink-gold/EvdevMarkerSource.h
    src/ink-gold/PenPipeline.cpp
    src/ink-gold/PenPipeline.h
    src/ink-gold/DisplayScheduler.cpp
    src/ink-gold/DisplayScheduler.h
    src/NoteStore.cpp
    src/NoteStore.h
    src/PenInputService.cpp
    src/PenInputService.h
    src/RefreshController.cpp
    src/RefreshController.h
    src/TestBridge.cpp
    src/TestBridge.h
    src/PerfLog.cpp
    src/PerfLog.h
    src/PaperOsPaths.h
    src/epfb.cpp
    src/ink_raster.cpp
    src/metrics.cpp
    src/metrics.h
)

qt_add_qml_module(paperos
    URI PaperOSApp
    VERSION 1.0
    QML_FILES
        qml/Main.qml
        qml/SystemDrawer.qml
        qml/PaperButton.qml
        qml/StatusLine.qml
        qml/HomeTodayPage.qml
        qml/TasksPage.qml
        qml/DocumentsPage.qml
        qml/NotesPage.qml
        qml/SystemPage.qml
        qml/InboxPage.qml
        qml/ReviewPage.qml
        # Legacy source, no longer mounted (PAPR.UI.2 §5): retained for
        # reference/rollback, not registered as an active route.
        qml/HomePage.qml
        qml/TodayPage.qml
        qml/MorePage.qml
)

target_link_libraries(paperos
    PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Qml
    Qt6::Quick
    Qt6::Network
)

# The epfb.cpp interposers must preempt the vendor scenegraph's QImage
# constructions to capture the panel framebuffer for native ink mode.
set_target_properties(paperos PROPERTIES ENABLE_EXPORTS ON)

qt_add_executable(paperos-ink-raster-qpa
    src/ink-gold/main_raster_qpa.cpp
    src/ink-gold/PenPipeline.cpp
    src/ink-gold/PenPipeline.h
    src/ink-gold/DisplayScheduler.cpp
    src/ink-gold/DisplayScheduler.h
    src/ink-gold/FixtureBridge.cpp
    src/ink-gold/FixtureBridge.h
    src/PerfLog.cpp
    src/PerfLog.h
    src/epfb.cpp
    src/epframebuffer.h
    src/ink_raster.cpp
    src/ink_raster.h
    src/metrics.cpp
    src/metrics.h
)

target_link_libraries(paperos-ink-raster-qpa
    PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Network
)

qt_add_executable(paperos-ink-live
    src/ink-gold/main_live.cpp
    src/ink-gold/EvdevMarkerSource.cpp
    src/ink-gold/EvdevMarkerSource.h
    src/ink-gold/LiveTestBridge.cpp
    src/ink-gold/LiveTestBridge.h
    src/ink-gold/PenPipeline.cpp
    src/ink-gold/PenPipeline.h
    src/ink-gold/DisplayScheduler.cpp
    src/ink-gold/DisplayScheduler.h
    src/PerfLog.cpp
    src/PerfLog.h
    src/epfb.cpp
    src/epframebuffer.h
    src/ink_raster.cpp
    src/ink_raster.h
    src/metrics.cpp
    src/metrics.h
)

target_link_libraries(paperos-ink-live
    PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Network
)

# Export dynamic symbols so the epfb.cpp interposers (QImage ctor,
# EPFramebuffer::setBuffers/swapBuffers) preempt the vendor scenegraph's
# calls — required to capture the panel framebuffer candidates.
set_target_properties(paperos-ink-live PROPERTIES ENABLE_EXPORTS ON)

# The production native ink mode host, spawned by the shell's
# InkModeController for one note session at a time.
qt_add_executable(paperos-ink-runtime
    src/ink-gold/main_runtime.cpp
    src/ink-gold/EvdevMarkerSource.cpp
    src/ink-gold/EvdevMarkerSource.h
    src/ink-gold/LiveTestBridge.cpp
    src/ink-gold/LiveTestBridge.h
    src/ink-gold/PenPipeline.cpp
    src/ink-gold/PenPipeline.h
    src/ink-gold/DisplayScheduler.cpp
    src/ink-gold/DisplayScheduler.h
    src/PerfLog.cpp
    src/PerfLog.h
    src/epfb.cpp
    src/epframebuffer.h
    src/ink_raster.cpp
    src/ink_raster.h
    src/metrics.cpp
    src/metrics.h
)

target_link_libraries(paperos-ink-runtime
    PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Network
)

set_target_properties(paperos-ink-runtime PROPERTIES ENABLE_EXPORTS ON)
