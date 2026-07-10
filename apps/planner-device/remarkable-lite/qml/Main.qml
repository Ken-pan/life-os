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
    readonly property var moduleNames: ["Home", "Today", "Notes", "Inbox", "Review", "System"]

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

        // SHELL HEADER — the status cluster is a tap target: Quick Settings.
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 84
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
                Layout.bottomMargin: 6
            }
            Item { Layout.fillWidth: true }

            Rectangle {
                Layout.preferredHeight: 72
                Layout.preferredWidth: statusText.implicitWidth + 48
                radius: Ui.radius
                color: quickSettings.visible ? Ui.ink : "transparent"
                border.width: 1
                border.color: Ui.line

                Text {
                    id: statusText
                    anchors.centerIn: parent
                    text: (deviceStatus.batteryPercent >= 0 ? deviceStatus.batteryPercent + "%" : "—")
                          + (apiClient.errorMessage !== "" ? " · offline" : "")
                          + (actionQueue.pendingCount > 0 ? " · " + actionQueue.pendingCount + " pending" : "")
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontMeta
                    color: quickSettings.visible ? Ui.card : Ui.mutedInk
                }

                MouseArea {
                    anchors.fill: parent
                    onClicked: quickSettings.visible = !quickSettings.visible
                }
            }

            PaperButton {
                label: "Exit"
                fontSize: Ui.fontMeta
                secondary: true
                implicitHeight: 72
                onTapped: Qt.quit()
            }
        }

        Rectangle {
            Layout.fillWidth: true
            height: 3
            color: Ui.lineStrong
        }

        // MODULE CONTENT
        StackLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            currentIndex: root.currentModule

            HomePage {}
            TodayPage {}
            NotesPage {}
            InboxPage {}
            ReviewPage {
                onNavigateTo: function(module) { root.currentModule = module }
            }
            SystemPage {}
        }

        // BOTTOM NAV — full-height tap targets, black-on-white inversion for
        // the active module. No light-gray states: inactive stays full ink.
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.tabBarHeight
            color: Ui.paper

            Rectangle {
                anchors.top: parent.top
                width: parent.width
                height: 3
                color: Ui.lineStrong
            }

            RowLayout {
                anchors.fill: parent
                anchors.topMargin: 11
                anchors.bottomMargin: 8
                spacing: 6

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
                            font.bold: true
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

    // QUICK SETTINGS — opened from the header status cluster. Everything a
    // pick-up-and-use moment needs without leaving the current page.
    Rectangle {
        id: quickSettings
        visible: false
        anchors.top: parent.top
        anchors.right: parent.right
        anchors.topMargin: 128
        anchors.rightMargin: Ui.pageMargin
        width: 560
        height: quickColumn.implicitHeight + Ui.cardPadding * 2
        z: 900
        color: Ui.card
        radius: Ui.radius
        border.width: 3
        border.color: Ui.lineStrong

        onVisibleChanged: refreshControl.pageUpdated()

        ColumnLayout {
            id: quickColumn
            anchors.fill: parent
            anchors.margins: Ui.cardPadding
            spacing: Ui.gap

            RowLayout {
                Layout.fillWidth: true
                Text {
                    text: "Quick Settings"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontSection
                    font.bold: true
                    color: Ui.ink
                }
                Item { Layout.fillWidth: true }
                PaperButton {
                    label: "Close"
                    fontSize: Ui.fontMeta
                    secondary: true
                    implicitHeight: Ui.buttonHeightSmall
                    onTapped: quickSettings.visible = false
                }
            }

            StatusLine {
                label: "Sync"
                value: apiClient.isLoading ? "syncing..."
                     : (apiClient.errorMessage !== "" ? "offline · last " + apiClient.lastSync
                                                      : "fresh · " + apiClient.lastSync)
            }
            StatusLine {
                label: "Battery"
                value: deviceStatus.batteryPercent >= 0
                       ? deviceStatus.batteryPercent + "% " + deviceStatus.batteryState : "unknown"
            }

            RowLayout {
                spacing: 12
                PaperButton {
                    label: apiClient.isLoading ? "Syncing..." : "Sync now"
                    fontSize: Ui.fontMeta
                    enabled: !apiClient.isLoading
                    implicitHeight: Ui.buttonHeightSmall
                    onTapped: apiClient.fetchDashboard()
                }
                PaperButton {
                    label: "Clean screen"
                    fontSize: Ui.fontMeta
                    implicitHeight: Ui.buttonHeightSmall
                    onTapped: { quickSettings.visible = false; refreshControl.requestClean() }
                }
            }

            RowLayout {
                spacing: 12
                Repeater {
                    model: ["clean", "balanced", "fast"]
                    delegate: PaperButton {
                        label: modelData.charAt(0).toUpperCase() + modelData.slice(1)
                        fontSize: Ui.fontMeta
                        implicitHeight: Ui.buttonHeightSmall
                        selected: refreshControl.mode === modelData
                        onTapped: refreshControl.mode = modelData
                    }
                }
            }

            PaperButton {
                label: "Return to reMarkable"
                fontSize: Ui.fontMeta
                Layout.fillWidth: true
                onTapped: Qt.quit()
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
