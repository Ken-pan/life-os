import QtQuick
import QtQuick.Layouts

// HomeTodayPage: Unified Daily Landing (Today) Page.
// Typographic layout combining recent writing, quick note actions,
// and today's top uncompleted tasks on a borderless paper canvas.
Item {
    id: page

    property var locallyCompleted: ({})

    readonly property var allNotes: noteStore.listNotes()
    readonly property var continueNote: allNotes.length > 0 ? allNotes[0] : null
    readonly property var recentNotes: allNotes.length > 1 ? allNotes.slice(1, 3) : []

    readonly property var allTasks: apiClient.dashboardData.tasks ? apiClient.dashboardData.tasks : []
    readonly property var uncompletedTasks: allTasks.filter(function(t) {
        var key = t.id !== undefined ? String(t.id) : ""
        return !t.completed && !page.locallyCompleted[key]
    })

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

        // ── CONTINUE WRITING ──────────────────────────────────
        Text {
            text: "Continue writing"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.primary
            font.bold: true
            color: Ui.ink70
            Layout.bottomMargin: 12
        }

        Item {
            visible: page.continueNote === null
            Layout.fillWidth: true
            Layout.preferredHeight: 88
            Layout.bottomMargin: Ui.gap

            RowLayout {
                anchors.fill: parent
                spacing: 16
                Text {
                    text: "Create a note"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.task
                    color: Ui.ink100
                }
                Text {
                    text: "+"
                    font.family: Ui.fontFamily
                    font.pixelSize: 34
                    font.bold: true
                    color: Ui.ink100
                }
            }
            MouseArea {
                anchors.fill: parent
                onPressed: {
                    var id = noteStore.createNote("quick")
                    if (id !== "")
                        inkMode.enter(id)
                }
            }
        }

        Item {
            visible: page.continueNote !== null
            Layout.fillWidth: true
            Layout.preferredHeight: 280
            Layout.bottomMargin: 12

            Rectangle {
                id: continuePreview
                anchors.fill: parent
                radius: 3
                color: Ui.paper
                border.width: 1
                border.color: Ui.ink30
                clip: true

                Image {
                    anchors.fill: parent
                    visible: page.continueNote && page.continueNote.hasInk
                    source: page.continueNote ? page.continueNote.previewUrl : ""
                    fillMode: Image.PreserveAspectCrop
                    asynchronous: true
                    cache: false
                    sourceClipRect: page.continueNote && page.continueNote.legacyChrome
                                  ? Qt.rect(96, 88, 858, 1608)
                                  : Qt.rect(0, 0, 954, 1696)
                }

                Rectangle {
                    visible: page.continueNote && !page.continueNote.hasInk
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
            MouseArea {
                anchors.fill: parent
                onClicked: {
                    if (page.continueNote)
                        inkMode.enter(page.continueNote.noteId)
                }
            }
        }

        Text {
            visible: page.continueNote !== null
            text: page.continueNote ? page.continueNote.displayTitle : ""
            font.family: Ui.fontFamily
            font.pixelSize: Ui.task
            font.bold: true
            color: Ui.ink100
            Layout.fillWidth: true
        }

        Text {
            visible: page.continueNote !== null
            text: page.continueNote ? (page.continueNote.hasInk ? page.continueNote.modifiedLabel : "Ready to write") : ""
            font.family: Ui.fontFamily
            font.pixelSize: Ui.meta
            color: Ui.ink70
            Layout.fillWidth: true
            Layout.bottomMargin: Ui.gap
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: Ui.divider }

        // ── RECENT NOTES ──────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 48
            Layout.topMargin: 12
            Layout.bottomMargin: 12

            Text {
                text: "Recent notes"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.primary
                font.bold: true
                color: Ui.ink70
            }
            Item { Layout.fillWidth: true }
            Text {
                text: "View all"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.meta
                color: Ui.ink70
                font.bold: true
            }
            MouseArea {
                anchors.fill: parent
                onClicked: root.currentModule = 2
            }
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 220
            spacing: 20
            visible: page.recentNotes.length > 0
            Layout.bottomMargin: Ui.gap

            Repeater {
                model: page.recentNotes
                delegate: Item {
                    Layout.fillWidth: true
                    Layout.fillHeight: true

                    Rectangle {
                        id: recentPreview
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        height: parent.height - 60
                        radius: 3
                        color: Ui.paper
                        border.width: 1
                        border.color: Ui.ink30
                        clip: true

                        Image {
                            anchors.fill: parent
                            visible: modelData.hasInk
                            source: modelData.previewUrl
                            fillMode: Image.PreserveAspectCrop
                            asynchronous: true
                            cache: false
                            sourceClipRect: modelData.legacyChrome
                                          ? Qt.rect(96, 88, 858, 1608)
                                          : Qt.rect(0, 0, 954, 1696)
                        }
                        Rectangle {
                            visible: !modelData.hasInk
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.top: parent.top
                            anchors.leftMargin: 20
                            anchors.rightMargin: 20
                            anchors.topMargin: 30
                            height: 2
                            color: Ui.ink30
                        }
                    }
                    Text {
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: recentPreview.bottom
                        anchors.topMargin: 8
                        text: modelData.displayTitle
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.meta
                        font.bold: true
                        color: Ui.ink100
                        elide: Text.ElideRight
                    }
                    MouseArea {
                        anchors.fill: parent
                        onClicked: inkMode.enter(modelData.noteId)
                    }
                }
            }
        }

        Text {
            visible: page.recentNotes.length === 0
            text: "No other recent notes"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.meta
            color: Ui.ink30
            Layout.bottomMargin: Ui.gap
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: Ui.divider }

        // ── TASKS ─────────────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 48
            Layout.topMargin: 12
            Layout.bottomMargin: 12

            Text {
                text: "Tasks"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.primary
                font.bold: true
                color: Ui.ink70
            }
            Item { Layout.fillWidth: true }
            Text {
                text: "View all"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.meta
                color: Ui.ink70
                font.bold: true
            }
            MouseArea {
                anchors.fill: parent
                onClicked: root.currentModule = 1
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 0
            visible: page.uncompletedTasks.length > 0
            Layout.bottomMargin: Ui.gap

            Repeater {
                model: page.uncompletedTasks.slice(0, 3)
                delegate: Item {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 72

                    Rectangle {
                        anchors.fill: parent
                        color: "#EEEEEE"
                        visible: rowTap.pressed
                    }

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 8
                        anchors.rightMargin: 8
                        spacing: 16

                        Rectangle {
                            width: 32
                            height: 32
                            border.width: 2
                            border.color: Ui.muted
                            color: "transparent"

                            MouseArea {
                                anchors.fill: parent
                                anchors.margins: -12
                                onClicked: {
                                    var key = modelData.id !== undefined ? String(modelData.id) : ""
                                    if (actionQueue.enqueue("task.complete", { id: modelData.id !== undefined ? modelData.id : key, title: modelData.title !== undefined ? modelData.title : String(modelData) })) {
                                        var done = page.locallyCompleted
                                        done[key] = true
                                        page.locallyCompleted = done
                                    }
                                }
                            }
                        }

                        Text {
                            Layout.fillWidth: true
                            text: modelData.title !== undefined ? modelData.title : modelData
                            font.family: Ui.fontFamily
                            font.pixelSize: Ui.task
                            color: Ui.ink100
                            elide: Text.ElideRight
                        }
                    }

                    MouseArea {
                        id: rowTap
                        anchors.fill: parent
                        z: -1
                        onClicked: root.currentModule = 1
                    }

                    Rectangle {
                        anchors.bottom: parent.bottom
                        width: parent.width
                        height: 1
                        color: Ui.divider
                    }
                }
            }
        }

        Text {
            visible: page.uncompletedTasks.length === 0
            text: "Nothing scheduled today"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.meta
            color: Ui.ink30
            Layout.bottomMargin: Ui.gap
        }

        Item { Layout.fillHeight: true }

        // ── STATUS FOOTER ─────────────────────────────────────
        Text {
            Layout.fillWidth: true
            text: (apiClient.isLoading ? "syncing" : (apiClient.errorMessage !== "" ? "offline" : "synced"))
                  + " · " + refreshControl.mode
            font.family: Ui.fontFamily
            font.pixelSize: Ui.footer
            color: Ui.muted
            elide: Text.ElideRight
        }
    }
}
