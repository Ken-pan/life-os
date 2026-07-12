import QtQuick
import QtQuick.Layouts

// Notes Gallery — Layer-2 navigation (brief §7.3). The shell header above
// this page carries menu · Notes · add; the page itself is category tabs
// plus a two-column shelf of paper thumbnails. The paper object is the
// interaction; metadata stays sparse. No card frames, no fake favorite or
// sync badges, no page counts the single-page data model cannot back.
Item {
    id: page

    readonly property bool landscape: width > height
    readonly property int columns: landscape ? 3 : 2
    readonly property int gridGap: landscape ? 20 : 22
    property string collection: "recent"
    property var allNotes: noteStore.listNotes()

    // Recent keeps the shelf scannable; All is the full set. Folders and
    // Favorites have no backing data yet, so they show truthful empty
    // states instead of fabricated collections.
    readonly property var notes: collection === "recent" ? allNotes.slice(0, 6)
                               : collection === "all" ? allNotes
                               : []
    readonly property string emptyLabel: collection === "folders" ? "No folders yet"
                                       : collection === "favorites" ? "No favorites yet"
                                       : "No notes yet"

    function refresh() {
        allNotes = noteStore.listNotes()
    }

    Connections {
        target: inkMode
        function onExited(code) { page.refresh() }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // ── collection tabs: text + underline, current = ink100 ────
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 72
            Layout.minimumHeight: 72
            Layout.maximumHeight: 72
            spacing: 8

            Repeater {
                model: [["recent", "Recent"], ["all", "All"], ["folders", "Folders"], ["favorites", "Favorites"]]
                delegate: Item {
                    objectName: "notes.collection." + modelData[0]
                    Layout.preferredWidth: tabLabel.implicitWidth + 44
                    Layout.fillHeight: true
                    readonly property bool current: page.collection === modelData[0]

                    Text {
                        id: tabLabel
                        anchors.centerIn: parent
                        text: modelData[1]
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.button
                        font.bold: parent.current
                        color: parent.current ? Ui.ink100 : Ui.ink70
                    }
                    Rectangle {
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.leftMargin: 12
                        anchors.rightMargin: 12
                        anchors.bottom: parent.bottom
                        anchors.bottomMargin: 10
                        height: 4
                        color: Ui.ink100
                        visible: parent.current
                    }
                    MouseArea {
                        anchors.fill: parent
                        onClicked: page.collection = modelData[0]
                    }
                }
            }
            Item { Layout.fillWidth: true }
        }

        GridView {
            id: shelf
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.topMargin: page.gridGap
            clip: true
            model: page.notes
            cellWidth: Math.floor(width / page.columns)
            cellHeight: page.landscape ? 610 : 590
            boundsBehavior: Flickable.StopAtBounds

            delegate: Item {
                objectName: "notes.item." + modelData.noteId
                width: shelf.cellWidth
                height: shelf.cellHeight

                Item {
                    anchors.fill: parent
                    anchors.rightMargin: index % page.columns === page.columns - 1 ? 0 : page.gridGap
                    anchors.bottomMargin: page.gridGap

                    // The paper object itself: paper fill, hairline edge —
                    // a real document edge, not decorative card chrome.
                    Rectangle {
                        id: preview
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        height: parent.height - 108
                        radius: 3
                        color: Ui.paper
                        border.width: 1
                        border.color: Ui.ink30
                        clip: true

                        Image {
                            anchors.fill: parent
                            anchors.margins: 2
                            visible: modelData.hasInk
                            source: modelData.previewUrl
                            fillMode: Image.PreserveAspectCrop
                            asynchronous: true
                            cache: false
                            // Crop only when the bitmap itself truthfully
                            // contains the old editor's full separator rules.
                            // New edge-to-edge pages display in full without
                            // adding a metadata format version.
                            sourceClipRect: modelData.legacyChrome
                                          ? Qt.rect(96, 88, 858, 1608)
                                          : Qt.rect(0, 0, 954, 1696)
                        }

                        // Blank paper keeps a restrained rule rather than an
                        // app-style placeholder icon.
                        Rectangle {
                            visible: !modelData.hasInk
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.top: parent.top
                            anchors.leftMargin: 32
                            anchors.rightMargin: 32
                            anchors.topMargin: 54
                            height: 2
                            color: Ui.ink30
                        }
                    }

                    Text {
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: preview.bottom
                        anchors.topMargin: 16
                        text: modelData.displayTitle
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.task
                        font.bold: true
                        color: Ui.ink100
                        elide: Text.ElideRight
                    }
                    Text {
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.bottom: parent.bottom
                        anchors.bottomMargin: 6
                        text: modelData.hasInk ? modelData.modifiedLabel : "Ready to write"
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.meta
                        color: Ui.ink70
                        elide: Text.ElideRight
                    }

                    MouseArea {
                        anchors.fill: parent
                        onClicked: inkMode.enter(modelData.noteId)
                    }
                }
            }
        }
    }

    // Empty state — content-first, no card.
    Column {
        anchors.centerIn: parent
        spacing: 12
        visible: page.notes.length === 0

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: page.emptyLabel
            font.family: Ui.fontFamily
            font.pixelSize: Ui.task
            color: Ui.ink70
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            visible: page.collection === "recent" || page.collection === "all"
            text: "Tap + to start writing"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.meta
            color: Ui.ink30
        }
    }
}
