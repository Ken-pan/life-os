import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Window

Window {
    id: root
    width: Screen.width
    height: Screen.height
    visible: true
    title: qsTr("PlannerOS Lite")
    
    readonly property int pageMargin: 44
    readonly property int gap: 16
    readonly property int cardPadding: 28
    readonly property int rowHeight: 124
    readonly property int footerHeight: 72
    readonly property int headerHeight: 132
    readonly property int focusCardHeight: 200
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

    color: root.paperColor

    Component.onCompleted: {
        console.log("Screen diagnostics:", Screen.width, "x", Screen.height, "pixelDensity:", Screen.pixelDensity)
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
                        text: "PlannerOS Lite"
                        font.pixelSize: root.fontTitle
                        font.bold: true
                        color: root.inkColor
                    }
                    Text {
                        text: apiClient.dashboardData.today ? apiClient.dashboardData.today.date : new Date().toLocaleDateString(Qt.locale(), "dddd, MMMM d, yyyy")
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
                        font.pixelSize: root.fontMeta
                        font.bold: true
                        color: root.accentColor
                    }

                    Text {
                        text: apiClient.dashboardData.today && apiClient.dashboardData.today.currentFocus ? apiClient.dashboardData.today.currentFocus.title : "No current focus"
                        font.pixelSize: root.fontFocus
                        font.bold: true
                        color: root.inkColor
                        elide: Text.ElideRight
                        Layout.fillWidth: true
                    }

                    Text {
                        text: "Focus block"
                        font.pixelSize: root.fontMeta
                        color: root.mutedInkColor
                    }
                }
            }

            // TASK SECTION
            Text {
                text: "Today"
                font.pixelSize: root.fontSection
                font.bold: true
                color: root.inkColor
                Layout.topMargin: root.gap
            }

            ListView {
                id: taskList
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                spacing: 12
                boundsBehavior: Flickable.StopAtBounds
                interactive: count > 4

                model: apiClient.dashboardData.tasks ? apiClient.dashboardData.tasks : [
                    { title: "1. Complete PR-4A Hello App (Fallback)", isCompleted: false },
                    { title: "2. Review PlannerOS API (Fallback)", isCompleted: false },
                    { title: "3. Sync local changes (Fallback)", isCompleted: false }
                ]
                
                delegate: Rectangle {
                    width: ListView.view.width
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
                                font.pixelSize: root.fontTask
                                color: root.inkColor
                                elide: Text.ElideRight
                                Layout.fillWidth: true
                            }
                            
                            Text {
                                text: "Priority: Normal"
                                font.pixelSize: root.fontMeta
                                color: root.mutedInkColor
                            }
                        }
                    }
                }

                ScrollBar.vertical: ScrollBar {
                    active: true
                    policy: ScrollBar.AsNeeded
                    width: 20
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
                        text: apiClient.isLoading ? "Syncing..." : ("Last sync: " + new Date().toLocaleTimeString() + " · Mock API")
                        font.pixelSize: root.fontMeta
                        color: root.mutedInkColor
                        Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                    }

                    Text {
                        visible: apiClient.errorMessage !== ""
                        text: "Offline: " + apiClient.errorMessage
                        font.pixelSize: root.fontMeta
                        color: root.accentColor
                        Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                    }
                }
            }
        }
    }
}
