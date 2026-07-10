import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Window

Window {
    id: root
    width: Screen.width
    height: Screen.height
    visible: true
    title: qsTr("PaperOS")

    readonly property int pageMargin: 44
    readonly property int gap: 16
    readonly property int cardPadding: 28
    readonly property int rowHeight: 124
    readonly property int footerHeight: 72
    readonly property int headerHeight: 132
    readonly property int focusCardHeight: 200
    readonly property int pagerHeight: 88
    readonly property int radius: 16

    readonly property int fontTitle: 42
    readonly property int fontFocus: 36
    readonly property int fontSection: 30
    readonly property int fontTask: 32
    readonly property int fontMeta: 23

    readonly property color paperColor: "#F7F4EA"
    readonly property color cardColor: "#FFFFFF"
    readonly property color inkColor: "#171717"
    readonly property color mutedInkColor: "#5E5E5E"
    readonly property color faintInkColor: "#8A8A8A"
    readonly property color lineColor: "#D8D2C4"
    readonly property color accentColor: "#7A1F2B"

    // appFontFamily is injected from C++; empty when no CJK font was loaded.
    readonly property string uiFont: (typeof appFontFamily !== "undefined" && appFontFamily !== "")
                                     ? appFontFamily : Qt.application.font.family

    // Pagination: fixed page of tasks, no scrolling on e-ink.
    readonly property int pageSize: 5
    property int pageIndex: 0
    readonly property var allTasks: apiClient.dashboardData.tasks ? apiClient.dashboardData.tasks : []
    readonly property int pageCount: Math.max(1, Math.ceil(allTasks.length / pageSize))
    readonly property var pageTasks: allTasks.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize)

    onAllTasksChanged: {
        if (pageIndex > pageCount - 1)
            pageIndex = Math.max(0, pageCount - 1)
    }

    color: root.paperColor

    Component.onCompleted: {
        console.log("Screen diagnostics:", Screen.width, "x", Screen.height, "pixelDensity:", Screen.pixelDensity)
        console.log("UI font family:", root.uiFont)
        apiClient.fetchDashboard()
    }

    Item {
        anchors.fill: parent
        anchors.margins: root.pageMargin

        ColumnLayout {
            anchors.fill: parent
            spacing: root.gap

            // HEADER
            Item {
                Layout.fillWidth: true
                Layout.preferredHeight: root.headerHeight

                ColumnLayout {
                    anchors.fill: parent
                    spacing: 4
                    Text {
                        text: "PaperOS"
                        font.family: root.uiFont
                        font.pixelSize: root.fontTitle
                        font.bold: true
                        color: root.inkColor
                    }
                    Text {
                        text: apiClient.dashboardData.today ? apiClient.dashboardData.today.date : new Date().toLocaleDateString(Qt.locale(), "dddd, MMMM d, yyyy")
                        font.family: root.uiFont
                        font.pixelSize: root.fontMeta
                        color: root.mutedInkColor
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                height: 2
                color: root.lineColor
            }

            // FOCUS CARD
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: root.focusCardHeight
                color: root.cardColor
                radius: root.radius
                border.width: 2
                border.color: root.lineColor

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: root.cardPadding
                    spacing: 8

                    Text {
                        text: "NOW"
                        font.family: root.uiFont
                        font.pixelSize: root.fontMeta
                        font.bold: true
                        color: root.accentColor
                    }

                    Text {
                        text: apiClient.dashboardData.today && apiClient.dashboardData.today.currentFocus && apiClient.dashboardData.today.currentFocus.title ? apiClient.dashboardData.today.currentFocus.title : "No current focus"
                        font.family: root.uiFont
                        font.pixelSize: root.fontFocus
                        font.bold: true
                        color: root.inkColor
                        elide: Text.ElideRight
                        Layout.fillWidth: true
                    }

                    Text {
                        text: "Focus block"
                        font.family: root.uiFont
                        font.pixelSize: root.fontMeta
                        color: root.mutedInkColor
                    }
                }
            }

            // TASK SECTION
            Text {
                text: "Today"
                font.family: root.uiFont
                font.pixelSize: root.fontSection
                font.bold: true
                color: root.inkColor
                Layout.topMargin: root.gap
            }

            // Fixed page of tasks — no Flickable/ListView; e-ink gets
            // instant page swaps via the pager below.
            Item {
                Layout.fillWidth: true
                Layout.fillHeight: true

                Column {
                    anchors.top: parent.top
                    width: parent.width
                    spacing: 12

                    Repeater {
                        model: root.pageTasks

                        delegate: Rectangle {
                            width: parent.width
                            height: root.rowHeight
                            color: root.cardColor
                            radius: root.radius
                            border.width: 1
                            border.color: root.lineColor

                            RowLayout {
                                anchors.fill: parent
                                anchors.margins: root.cardPadding
                                spacing: root.gap

                                // Mock Checkbox Visual
                                Rectangle {
                                    width: 40
                                    height: 40
                                    radius: 8
                                    border.width: 2
                                    border.color: root.faintInkColor
                                    color: "transparent"
                                }

                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 4

                                    Text {
                                        text: modelData.title !== undefined ? modelData.title : modelData
                                        font.family: root.uiFont
                                        font.pixelSize: root.fontTask
                                        color: root.inkColor
                                        elide: Text.ElideRight
                                        Layout.fillWidth: true
                                    }

                                    Text {
                                        text: (modelData.priority ? modelData.priority : "P3") + (modelData.dueTime ? " · " + modelData.dueTime : "")
                                        font.family: root.uiFont
                                        font.pixelSize: root.fontMeta
                                        color: root.mutedInkColor
                                    }
                                }
                            }
                        }
                    }
                }

                Text {
                    anchors.centerIn: parent
                    visible: root.allTasks.length === 0
                    text: apiClient.isLoading ? "Loading tasks..." : "No tasks for today"
                    font.family: root.uiFont
                    font.pixelSize: root.fontTask
                    color: root.faintInkColor
                }
            }

            // PAGER
            Item {
                Layout.fillWidth: true
                Layout.preferredHeight: root.pagerHeight
                visible: root.allTasks.length > root.pageSize

                RowLayout {
                    anchors.centerIn: parent
                    spacing: 48

                    Rectangle {
                        readonly property bool enabled: root.pageIndex > 0
                        width: 180
                        height: 64
                        radius: root.radius
                        color: root.cardColor
                        border.width: 2
                        border.color: enabled ? root.inkColor : root.lineColor

                        Text {
                            anchors.centerIn: parent
                            text: "‹  Prev"
                            font.family: root.uiFont
                            font.pixelSize: root.fontSection
                            color: parent.enabled ? root.inkColor : root.faintInkColor
                        }

                        MouseArea {
                            anchors.fill: parent
                            enabled: parent.enabled
                            onClicked: root.pageIndex = Math.max(0, root.pageIndex - 1)
                        }
                    }

                    Text {
                        text: (root.pageIndex + 1) + " / " + root.pageCount
                        font.family: root.uiFont
                        font.pixelSize: root.fontSection
                        color: root.mutedInkColor
                    }

                    Rectangle {
                        readonly property bool enabled: root.pageIndex < root.pageCount - 1
                        width: 180
                        height: 64
                        radius: root.radius
                        color: root.cardColor
                        border.width: 2
                        border.color: enabled ? root.inkColor : root.lineColor

                        Text {
                            anchors.centerIn: parent
                            text: "Next  ›"
                            font.family: root.uiFont
                            font.pixelSize: root.fontSection
                            color: parent.enabled ? root.inkColor : root.faintInkColor
                        }

                        MouseArea {
                            anchors.fill: parent
                            enabled: parent.enabled
                            onClicked: root.pageIndex = Math.min(root.pageCount - 1, root.pageIndex + 1)
                        }
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                height: 2
                color: root.lineColor
            }

            // FOOTER
            Item {
                Layout.fillWidth: true
                Layout.preferredHeight: root.footerHeight

                RowLayout {
                    anchors.fill: parent

                    Text {
                        text: apiClient.isLoading ? "Syncing..." : ("Last sync: " + (apiClient.lastSync !== "" ? apiClient.lastSync : "never") + " · " + (apiClient.mode === "real" ? "Real API" : "Mock API"))
                        font.family: root.uiFont
                        font.pixelSize: root.fontMeta
                        color: root.mutedInkColor
                        Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                    }

                    Text {
                        visible: apiClient.errorMessage !== ""
                        text: "Offline: " + apiClient.errorMessage
                        font.family: root.uiFont
                        font.pixelSize: root.fontMeta
                        color: root.accentColor
                        Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                    }
                }
            }
        }
    }
}
