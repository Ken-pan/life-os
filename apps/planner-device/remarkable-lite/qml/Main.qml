import QtQuick
import QtQuick.Layouts
import QtQuick.Window

// PaperOS Shell: 6-module e-ink home experience for 954x1696 portrait.
// Navigation is page-swap only — no scrolling, no animation. A black
// full-screen flash (driven by RefreshController) deghosts the panel.
Window {
    id: root
    width: Screen.width
    height: Screen.height
    visible: true
    title: qsTr("PaperOS")
    color: Ui.paper

    property int currentModule: 0
    readonly property var moduleNames: ["Home", "Today", "Notes", "Mail", "Review", "System"]

    onCurrentModuleChanged: refreshControl.pageUpdated()

    Component.onCompleted: {
        console.log("PaperOS shell up · font:", Ui.fontFamily,
                    "· screen:", Screen.width, "x", Screen.height)
        apiClient.fetchDashboard()
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.pageMargin
        anchors.bottomMargin: 0
        spacing: Ui.gap

        // SHELL HEADER
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 72
            spacing: Ui.gap

            Text {
                text: "PaperOS"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontTitle
                font.bold: true
                color: Ui.ink
            }
            Text {
                text: root.moduleNames[root.currentModule]
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontSection
                color: Ui.mutedInk
                Layout.alignment: Qt.AlignBottom
                Layout.bottomMargin: 4
            }
            Item { Layout.fillWidth: true }
            Text {
                text: (deviceStatus.batteryPercent >= 0 ? deviceStatus.batteryPercent + "%" : "")
                      + (apiClient.errorMessage !== "" ? "  ·  offline" : "")
                      + (actionQueue.pendingCount > 0 ? "  ·  " + actionQueue.pendingCount + " pending" : "")
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontMeta
                color: Ui.mutedInk
                Layout.alignment: Qt.AlignVCenter
            }
            PaperButton {
                label: "Exit"
                fontSize: Ui.fontMeta
                implicitHeight: 56
                onTapped: Qt.quit()
            }
        }

        Rectangle {
            Layout.fillWidth: true
            height: 2
            color: Ui.line
        }

        // MODULE CONTENT
        StackLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            currentIndex: root.currentModule

            HomePage {}
            TodayPage {}
            NotesPage {}
            MailPage {}
            ReviewPage {}
            SystemPage {}
        }

        // BOTTOM NAV
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 104
            color: Ui.paper

            Rectangle {
                anchors.top: parent.top
                width: parent.width
                height: 2
                color: Ui.line
            }

            RowLayout {
                anchors.fill: parent
                anchors.margins: 8
                spacing: 8

                Repeater {
                    model: root.moduleNames
                    delegate: Rectangle {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        radius: Ui.radius
                        color: root.currentModule === index ? Ui.ink : "transparent"

                        Text {
                            anchors.centerIn: parent
                            text: modelData
                            font.family: Ui.fontFamily
                            font.pixelSize: Ui.fontMeta
                            font.bold: root.currentModule === index
                            color: root.currentModule === index ? Ui.card : Ui.ink
                        }

                        MouseArea {
                            anchors.fill: parent
                            onClicked: root.currentModule = index
                        }
                    }
                }
            }
        }
    }

    // CLEAN-SCREEN FLASH: painting the whole panel black for a moment
    // forces the epaper backend into a full repaint, clearing ghosting.
    Rectangle {
        id: cleanFlash
        anchors.fill: parent
        color: "#000000"
        visible: false
        z: 1000

        Timer {
            id: flashTimer
            interval: 260
            onTriggered: cleanFlash.visible = false
        }
    }

    Connections {
        target: refreshControl
        function onCleanRequested() {
            cleanFlash.visible = true
            flashTimer.restart()
        }
    }
}
