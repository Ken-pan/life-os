import QtQuick
import QtQuick.Layouts
import QtQuick.Window

// PaperOS Shell — paper canvas + contextual tools + temporary system surfaces.
// Layer-1 navigation lives in a temporary System drawer (SystemDrawer.qml)
// opened from the shell menu button; there is no permanent tab bar or rail.
// One compact header row carries: menu · current page title · Home action ·
// contextual add. All seven module routes stay mounted at their indices.
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
    readonly property var moduleTitles: ["Home", "Today", "Notes", "Inbox", "Review", "System", "More"]
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

    onCurrentModuleChanged: refreshControl.pageUpdated()

    Component.onCompleted: {
        console.log("PaperOS shell up · font:", Ui.fontFamily,
                    "· screen:", Screen.width, "x", Screen.height,
                    "· scale:", Ui.scale)
        apiClient.fetchDashboard()
    }

    // Bridge marker: the shell is in its closed state (no temporary surface).
    Item {
        objectName: "shell.closed"
        visible: !systemDrawer.open
        width: 0; height: 0
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.leftMargin: root.landscape ? 40 : Ui.pageMargin
        anchors.rightMargin: root.landscape ? 40 : Ui.pageMargin
        anchors.topMargin: root.landscape ? 24 : 32
        spacing: 0

        // ── SHELL HEADER ───────────────────────────────────────────
        // menu · title · Home action · contextual add. Quiet and
        // borderless; whitespace separates it from page content.
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 88
            Layout.bottomMargin: 8
            spacing: 24

            Item {
                objectName: "shell.menu"
                Layout.preferredWidth: 72
                Layout.preferredHeight: 72
                Layout.alignment: Qt.AlignVCenter

                Rectangle {
                    anchors.fill: parent
                    color: Ui.ink100
                    visible: menuTap.pressed
                }
                Column {
                    anchors.centerIn: parent
                    spacing: 9
                    Repeater {
                        model: 3
                        Rectangle {
                            width: 34; height: 4
                            color: menuTap.pressed ? Ui.paper : Ui.ink100
                        }
                    }
                }
                MouseArea {
                    id: menuTap
                    anchors.fill: parent
                    onClicked: systemDrawer.open = true
                }
            }

            Text {
                text: root.moduleTitles[root.currentModule]
                font.family: Ui.fontFamily
                font.pixelSize: Ui.section
                font.bold: true
                color: Ui.ink100
            }

            Item { Layout.fillWidth: true }

            // Home is a Layer-1 system action and stays visibly reachable
            // while the drawer is closed (visible gesture alternative).
            Item {
                objectName: "nav.home"
                Layout.preferredWidth: homeLabel.implicitWidth + 32
                Layout.preferredHeight: 72
                Layout.alignment: Qt.AlignVCenter

                Rectangle {
                    anchors.fill: parent
                    color: Ui.ink100
                    visible: homeTap.pressed
                }
                Text {
                    id: homeLabel
                    anchors.centerIn: parent
                    text: "Home"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.button
                    color: homeTap.pressed ? Ui.paper
                         : root.currentModule === 0 ? Ui.ink30
                         : Ui.ink70
                }
                MouseArea {
                    id: homeTap
                    anchors.fill: parent
                    onClicked: root.currentModule = 0
                }
            }

            // Contextual add — Notes only. Routes through the existing safe
            // quick-note flow; the template picker is a later slice.
            Rectangle {
                objectName: "notes.new"
                visible: root.currentModule === 2
                Layout.preferredWidth: 72
                Layout.preferredHeight: 72
                Layout.alignment: Qt.AlignVCenter
                color: Ui.ink100

                Text {
                    anchors.centerIn: parent
                    text: "+"
                    font.family: Ui.fontFamily
                    font.pixelSize: 46
                    color: Ui.paper
                }
                MouseArea {
                    anchors.fill: parent
                    onClicked: {
                        var id = noteStore.createNote("quick")
                        if (id !== "")
                            inkMode.enter(id)
                    }
                }
            }
        }

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
    }

    // ── SYSTEM DRAWER ──────────────────────────────────────────
    SystemDrawer {
        id: systemDrawer
        anchors.fill: parent
        z: 880
        currentModule: root.currentModule
        onNavigate: function(module) { root.currentModule = module }
        onOpenChanged: refreshControl.pageUpdated()
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
                text: apiClient.isLoading ? "syncing..."
                     : (apiClient.errorMessage !== "" ? "offline · last " + apiClient.lastSync
                                                      : "synced · " + apiClient.lastSync)
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
    // Static full-white cover while the in-process ink session owns the
    // display: freezes the scenegraph's last swap and eats all touch input
    // so the shell UI cannot react (the Marker is grabbed by the runtime).
    //
    // IMPORTANT: nothing inside this overlay may change a visual property
    // while inkMode.active is true — any scenegraph re-render would swap
    // the white cover over the live ink framebuffer and destroy unsaved
    // strokes. Visibility binds to inkMode.active only, which changes
    // exactly at the enter/exit render boundaries.
    Rectangle {
        id: nativeInkCover
        anchors.fill: parent
        color: "#FFFFFF"
        visible: inkMode.active
        z: 900

        MouseArea {
            anchors.fill: parent
            enabled: inkMode.active
            preventStealing: true
        }

        // Finger/bridge alternative for the pen-tappable chrome handle.
        // Geometry mirrors InkModeController::handleRect(). A MouseArea has
        // no visual content, so taps cannot dirty the frozen scenegraph.
        MouseArea {
            objectName: "editor.chrome.handle"
            x: 12
            y: 12
            width: 88
            height: 88
            // Active changes only at the native enter/exit boundary. Do not
            // bind this item to ready/chrome while direct ink owns the frame.
            enabled: inkMode.active
            onClicked: inkMode.toggleChrome()
        }

        // Static, non-rendering semantic roots. TestBridge reports their
        // logical visibility from the root state; no QQuickItem property
        // changes while the native framebuffer is active.
        Item { anchors.fill: parent; objectName: "editor.clean" }
        Item { anchors.fill: parent; objectName: "editor.tools.revealed" }
        Item { anchors.fill: parent; objectName: "editor.after-writing" }

        // Debug-bridge-only, read-only fixture. It changes presentation
        // state through the same retreat path as pen-up, but injects no
        // stroke and never enters, exits, creates, or saves a note.
        Item {
            objectName: inkMode.testBridgeEnabled ? "editor.fixture.after-writing" : ""
            x: parent.width - 100
            y: parent.height - 100
            width: 88
            height: 88
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
