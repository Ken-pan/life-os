import QtQuick
import QtQuick.Layouts

// A quiet notebook shelf: two columns on the Move in portrait, three in
// landscape. The preview is the interaction; metadata stays deliberately
// sparse so the page scans like a physical shelf rather than a dashboard.
Item {
    id: page

    readonly property bool landscape: width > height
    readonly property int columns: landscape ? 3 : 2
    readonly property int gridGap: landscape ? 20 : 22
    property string collection: "recent"
    property var notes: noteStore.listNotes()

    function refresh() {
        notes = noteStore.listNotes()
    }

    Connections {
        target: inkMode
        function onExited(code) { page.refresh() }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // 96 px orientation + creation bar. The count is secondary and the
        // square + action remains a full 88 px target.
        Item {
            Layout.fillWidth: true
            Layout.preferredHeight: 104
            Layout.minimumHeight: 104
            Layout.maximumHeight: 104

            Column {
                anchors.left: parent.left
                anchors.right: newNoteButton.left
                anchors.rightMargin: 20
                anchors.verticalCenter: parent.verticalCenter
                spacing: 2

                Text {
                    width: parent.width
                    text: "Notebooks"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.section
                    font.bold: true
                    color: Ui.ink
                }
                Text {
                    width: parent.width
                    text: page.notes.length + (page.notes.length === 1 ? " notebook" : " notebooks") + "  ·  On this device"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.meta
                    color: Ui.muted
                }
            }

            Rectangle {
                id: newNoteButton
                objectName: "notes.new"
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                width: 88
                height: 88
                color: Ui.ink

                Text {
                    anchors.centerIn: parent
                    text: "+"
                    font.family: Ui.fontFamily
                    font.pixelSize: 52
                    color: Ui.paper
                }
                MouseArea {
                    anchors.fill: parent
                    onClicked: {
                        var id = noteStore.createNote("quick")
                        if (id !== "") {
                            page.refresh()
                            inkMode.enter(id)
                        }
                    }
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 76
            Layout.minimumHeight: 76
            Layout.maximumHeight: 76
            spacing: 0

            Repeater {
                model: [["recent", "Recent"], ["all", "All notebooks"]]
                delegate: Item {
                    Layout.preferredWidth: Math.max(190, tabLabel.implicitWidth + 48)
                    Layout.fillHeight: true

                    Text {
                        id: tabLabel
                        anchors.centerIn: parent
                        text: modelData[1]
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.button
                        font.bold: page.collection === modelData[0]
                        color: page.collection === modelData[0] ? Ui.ink : Ui.muted
                    }
                    Rectangle {
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.bottom: parent.bottom
                        height: page.collection === modelData[0] ? 4 : 1
                        color: Ui.ink
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

                    Rectangle {
                        id: preview
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        height: parent.height - 116
                        color: "#F4F4F1"
                        border.width: 2
                        border.color: Ui.ink
                        clip: true

                        Image {
                            anchors.fill: parent
                            anchors.margins: 4
                            visible: modelData.hasInk
                            source: modelData.previewUrl
                            fillMode: Image.PreserveAspectCrop
                            asynchronous: true
                            cache: false
                            sourceClipRect: Qt.rect(96, 88, 858, 1608)
                        }

                        // Blank paper gets a restrained rule rather than an
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
                            color: "#C9C9C5"
                        }
                        Text {
                            visible: !modelData.hasInk
                            anchors.centerIn: parent
                            text: "Blank page"
                            font.family: Ui.fontFamily
                            font.pixelSize: Ui.meta
                            color: Ui.muted
                        }
                    }

                    Text {
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: preview.bottom
                        anchors.topMargin: 14
                        text: modelData.displayTitle
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.task
                        font.bold: true
                        color: Ui.ink
                        elide: Text.ElideRight
                    }
                    Text {
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.bottom: parent.bottom
                        text: modelData.pageCount + " page  ·  " + (modelData.hasInk ? modelData.modifiedLabel : "Ready to write")
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.meta
                        color: Ui.muted
                        elide: Text.ElideRight
                    }

                    MouseArea {
                        anchors.fill: parent
                        onClicked: inkMode.enter(modelData.noteId)
                    }
                }
            }

            Text {
                anchors.centerIn: parent
                visible: page.notes.length === 0
                text: "No notebooks yet"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.task
                color: Ui.muted
            }
        }
    }
}
