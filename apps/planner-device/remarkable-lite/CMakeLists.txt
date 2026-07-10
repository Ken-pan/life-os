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
    src/NoteStore.cpp
    src/NoteStore.h
    src/RefreshController.cpp
    src/RefreshController.h
    src/PaperOsPaths.h
)

qt_add_qml_module(paperos
    URI PaperOSApp
    VERSION 1.0
    QML_FILES
        qml/Main.qml
        qml/PaperButton.qml
        qml/StatusLine.qml
        qml/HomePage.qml
        qml/TodayPage.qml
        qml/NotesPage.qml
        qml/MailPage.qml
        qml/ReviewPage.qml
        qml/SystemPage.qml
)

target_link_libraries(paperos
    PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Qml
    Qt6::Quick
    Qt6::Network
)
