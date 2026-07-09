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
)

qt_add_qml_module(paperos
    URI PaperOS
    VERSION 1.0
    QML_FILES
        qml/Main.qml
)

target_link_libraries(paperos
    PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Qml
    Qt6::Quick
    Qt6::Network
)
