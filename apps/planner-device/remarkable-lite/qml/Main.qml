import QtQuick
import QtQuick.Layouts
import QtQuick.Window

// PaperOS Shell — paper-native, minimal chrome.
// 4 primary tabs: Home / Today / Write / ···
// Hidden modules (Inbox, Review, System) accessed via More page.
// No header bar. No thick border frame. Just content and a quiet tab strip.
Window {
    id: root
    objectName: "app.root"
    width: Screen.width
    height: Screen.height
    visible: true
    title: qsTr("PaperOS")
    color: Ui.paper

    // module indices: 0=Home, 1=Today, 2=Write(Notes), 3=Inbox, 4=Review, 5=System, 6=More
    property int currentModule: 0
    readonly property bool landscape: width > height
    // Mirrored onto the root object so the local-only test bridge can inspect
    // native framebuffer sessions without reaching into QML context objects.
    property bool nativeInkActive: inkMode.active
    property string nativeInkNoteId: inkMode.noteId
    property string nativeInkTool: inkMode.tool
    property string nativeInkColor: inkMode.color

    function exitNativeInk() {
        if (inkMode.active)
            inkMode.exit()
    }

    // The 4 visible tabs map to these module indices
    readonly property var tabModules: [0, 1, 2, 6]
    readonly property var tabLabels: ["Home", "Today", "Write", "···"]
    readonly property var tabIds: ["home", "today", "write", "more"]

    onCurrentModuleChanged: refreshControl.pageUpdated()

    Component.onCompleted: {
        console.log("PaperOS shell up · font:", Ui.fontFamily,
                    "· screen:", Screen.width, "x", Screen.height,
                    "· scale:", Ui.scale)
        apiClient.fetchDashboard()
    }

    Component {
        id: portraitNavigation
        Item {
            implicitHeight: Ui.tabH
            Rectangle { anchors.left: parent.left; anchors.right: parent.right; height: 1; color: Ui.divider }
            RowLayout {
                anchors.fill: parent
                spacing: 0
                Repeater {
                    model: root.tabLabels
                    delegate: Item {
                        objectName: "nav." + root.tabIds[index]
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        readonly property int targetModule: root.tabModules[index]
                        readonly property bool active: root.currentModule === targetModule
                                                     || (targetModule === 6 && root.currentModule >= 3 && root.currentModule <= 5)
                        Text {
                            anchors.centerIn: parent
                            text: modelData
                            font.family: Ui.fontFamily
                            font.pixelSize: Ui.button
                            font.bold: active
                            color: active ? Ui.ink : Ui.muted
                        }
                        Rectangle {
                            anchors.bottom: parent.bottom
                            anchors.horizontalCenter: parent.horizontalCenter
                            width: parent.width * 0.55
                            height: active ? 4 : 0
                            color: Ui.ink
                        }
                        MouseArea { anchors.fill: parent; onClicked: root.currentModule = targetModule }
                    }
                }
            }
        }
    }

    Component {
        id: landscapeNavigation
        Item {
            implicitWidth: 132
            Rectangle { anchors.top: parent.top; anchors.bottom: parent.bottom; anchors.right: parent.right; width: 2; color: Ui.divider }
            ColumnLayout {
                anchors.fill: parent
                anchors.topMargin: 24
                anchors.bottomMargin: 24
                spacing: 8
                Repeater {
                    model: root.tabLabels
                    delegate: Item {
                        objectName: "nav." + root.tabIds[index]
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        readonly property int targetModule: root.tabModules[index]
                        readonly property bool active: root.currentModule === targetModule
                                                     || (targetModule === 6 && root.currentModule >= 3 && root.currentModule <= 5)
                        Rectangle {
                            anchors.left: parent.left
                            anchors.top: parent.top
                            anchors.bottom: parent.bottom
                            width: active ? 6 : 0
                            color: Ui.ink
                        }
                        Text {
                            anchors.centerIn: parent
                            text: modelData
                            font.family: Ui.fontFamily
                            font.pixelSize: Ui.button
                            font.bold: active
                            color: active ? Ui.ink : Ui.muted
                        }
                        MouseArea { anchors.fill: parent; onClicked: root.currentModule = targetModule }
                    }
                }
            }
        }
    }

    RowLayout {
        anchors.fill: parent
        spacing: 0

        Loader {
            visible: root.landscape
            active: root.landscape
            sourceComponent: landscapeNavigation
            Layout.preferredWidth: root.landscape ? 132 : 0
            Layout.fillHeight: true
        }

        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.leftMargin: root.landscape ? 40 : Ui.pageMargin
            Layout.rightMargin: root.landscape ? 40 : Ui.pageMargin
            Layout.topMargin: root.landscape ? 32 : Ui.pageMargin
            spacing: 0

            StackLayout {
                objectName: "module.stack"
                Layout.fillWidth: true
                Layout.fillHeight: true
                currentIndex: root.currentModule

                HomePage { objectName: "page.home" }
                TodayPage { objectName: "page.today" }
                NotesPage { objectName: "page.write" }
                InboxPage { objectName: "page.inbox" }
                ReviewPage {
                    objectName: "page.review"
                    onNavigateTo: function(module) { root.currentModule = module }
                }
                SystemPage { objectName: "page.system" }
                MorePage {
                    objectName: "page.more"
                    onOpenModule: function(module) { root.currentModule = module }
                }
            }

            Loader {
                visible: !root.landscape
                active: !root.landscape
                sourceComponent: portraitNavigation
                Layout.fillWidth: true
                Layout.preferredHeight: root.landscape ? 0 : Ui.tabH
            }
        }
    }

    // ── QUICK SETTINGS OVERLAY ─────────────────────────────────
    // Activated from System page or a future gesture. Kept minimal.
    Rectangle {
        id: quickSettings
        visible: false
        anchors.top: parent.top
        anchors.right: parent.right
        anchors.topMargin: Ui.pageMargin
        anchors.rightMargin: Ui.pageMargin
        width: 520
        height: quickColumn.implicitHeight + 48
        z: 900
        color: Ui.paper
        border.width: 2
        border.color: Ui.ink

        onVisibleChanged: refreshControl.pageUpdated()

        ColumnLayout {
            id: quickColumn
            anchors.fill: parent
            anchors.margins: 24
            spacing: Ui.gap

            RowLayout {
                Layout.fillWidth: true
                Text {
                    text: "Quick Settings"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.section
                    font.bold: true
                    color: Ui.ink
                }
                Item { Layout.fillWidth: true }
                PaperButton {
                    label: "Close"
                    secondary: true
                    implicitHeight: Ui.btnHs
                    onTapped: quickSettings.visible = false
                }
            }

            Text {
                text: apiClient.syncSummary
                font.family: Ui.fontFamily
                font.pixelSize: Ui.meta
                color: Ui.muted
            }

            RowLayout {
                spacing: 12
                PaperButton {
                    label: apiClient.isLoading ? "Syncing..." : "Sync now"
                    enabled: !apiClient.isLoading
                    implicitHeight: Ui.btnHs
                    onTapped: apiClient.fetchDashboard()
                }
                PaperButton {
                    label: "Clean screen"
                    implicitHeight: Ui.btnHs
                    onTapped: { quickSettings.visible = false; refreshControl.requestClean() }
                }
            }

            RowLayout {
                spacing: 12
                Repeater {
                    model: ["clean", "balanced", "fast"]
                    delegate: PaperButton {
                        label: modelData.charAt(0).toUpperCase() + modelData.slice(1)
                        implicitHeight: Ui.btnHs
                        selected: refreshControl.mode === modelData
                        onTapped: refreshControl.mode = modelData
                    }
                }
            }

            PaperButton {
                label: "Return to reMarkable"
                Layout.fillWidth: true
                implicitHeight: Ui.btnH
                onTapped: Qt.quit()
            }
        }
    }

    // ── NATIVE INK MODE OVERLAY ────────────────────────────────
    // Static full-white cover while paperos-ink-runtime owns the display:
    // freezes the scenegraph's last swap and eats all touch input so the
    // shell UI cannot react (the Marker is grabbed by the runtime).
    Rectangle {
        anchors.fill: parent
        color: "#FFFFFF"
        visible: inkMode.active
        z: 900

        MouseArea {
            anchors.fill: parent
            enabled: inkMode.active
            preventStealing: true
        }
    }

    // ── CLEAN-SCREEN FLASH ─────────────────────────────────────
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
