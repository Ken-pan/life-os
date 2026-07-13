import QtQuick
import QtQuick.Layouts

// HomeTodayPage — the canonical Today landing (PAPR.UI.2 §2.2/§5.3).
// Merges the old Home + Today pages into one daily-glance destination:
// resume the most recent notebook, scan today's real tasks, reach recent
// content. No outer card, no nested card, no dashboard grid — the screen
// itself is the canvas. Content is capped so the page reads in one glance;
// overflow uses "View all" rather than scrolling further.
Item {
    id: page

    signal openNotes()
    signal openTasks()

    property var allNotes: []
    readonly property var continueNote: allNotes.length > 0 ? allNotes[0] : null
    readonly property var recentNotes: allNotes.length > 1 ? allNotes.slice(1, 3) : []

    readonly property var allTasks: apiClient.dashboardData.tasks ? apiClient.dashboardData.tasks : []
    // Uncompleted first, so the three-row preview surfaces what's left to do.
    readonly property var previewTasks: {
        var open = allTasks.filter(function(t) { return !t.completed })
        var done = allTasks.filter(function(t) { return t.completed })
        return open.concat(done).slice(0, 3)
    }

    property string dateLabel: ""

    function refreshDate() {
        var now = new Date()
        page.dateLabel = now.toLocaleDateString(Qt.locale(), "ddd, MMM d")
    }

    function refreshNotes() {
        var notes = noteStore.listNotes()
        page.allNotes = notes ? notes : []
    }

    Component.onCompleted: {
        refreshDate()
        refreshNotes()
    }
    onVisibleChanged: {
        if (visible)
            refreshNotes()
    }
    Timer { interval: 60000; running: !inkMode.active; repeat: true; onTriggered: page.refreshDate() }

    Connections {
        target: inkMode
        function onExited(code) { page.refreshNotes() }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // ── Date ───────────────────────────────────────────────
        Text {
            text: page.dateLabel
            font.family: Ui.fontFamily
            font.pixelSize: Ui.section
            font.bold: true
            color: Ui.ink100
            Layout.bottomMargin: 28
        }

        // ── Continue writing ────────────────────────────────────
        Text {
            text: "Continue writing"
            visible: page.continueNote !== null
            font.family: Ui.fontFamily
            font.pixelSize: Ui.meta
            font.bold: true
            color: Ui.ink70
            Layout.bottomMargin: 10
        }
        Rectangle {
            id: continueCard
            objectName: "today.continue"
            visible: page.continueNote !== null
            Layout.fillWidth: true
            Layout.preferredHeight: 132
            Layout.bottomMargin: 28
            color: "#F4F4F1"

            RowLayout {
                anchors.fill: parent
                anchors.margins: 20
                spacing: 20

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4
                    Text {
                        text: page.continueNote ? page.continueNote.displayTitle : ""
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.task
                        font.bold: true
                        color: Ui.ink100
                        elide: Text.ElideRight
                        Layout.fillWidth: true
                    }
                    Text {
                        text: page.continueNote
                              ? (page.continueNote.pageCount + " page  ·  " + (page.continueNote.hasInk ? page.continueNote.modifiedLabel : "Ready to write"))
                              : ""
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.meta
                        color: Ui.ink70
                    }
                }
            }
            MouseArea {
                anchors.fill: parent
                onClicked: inkMode.enter(page.continueNote.noteId)
            }
        }
        // No notes at all: light create-a-note row (existing safe quick-note flow).
        Item {
            objectName: "today.createNote"
            visible: page.continueNote === null
            Layout.fillWidth: true
            Layout.preferredHeight: 72
            Layout.bottomMargin: 28

            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: "+  Create a note"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.task
                color: Ui.ink70
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

        // ── Recent notes ─────────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            Layout.bottomMargin: 10
            Text {
                text: "Recent notes"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.meta
                font.bold: true
                color: Ui.ink70
            }
            Item { Layout.fillWidth: true }
            Text {
                objectName: "today.notes.viewAll"
                text: "View all"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.meta
                color: Ui.ink70
                MouseArea { anchors.fill: parent; anchors.margins: -16; onClicked: page.openNotes() }
            }
        }
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 160
            Layout.bottomMargin: 28
            spacing: 20
            visible: page.recentNotes.length > 0

            Repeater {
                model: page.recentNotes
                delegate: Rectangle {
                    objectName: "today.notes.recent." + modelData.noteId
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    color: "#F4F4F1"

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 16
                        Text {
                            text: modelData.displayTitle
                            font.family: Ui.fontFamily
                            font.pixelSize: Ui.meta
                            font.bold: true
                            color: Ui.ink100
                            elide: Text.ElideRight
                            Layout.fillWidth: true
                        }
                        Item { Layout.fillHeight: true }
                        Text {
                            text: modelData.hasInk ? modelData.modifiedLabel : "Ready to write"
                            font.family: Ui.fontFamily
                            font.pixelSize: Ui.footer
                            color: Ui.ink70
                        }
                    }
                    MouseArea { anchors.fill: parent; onClicked: inkMode.enter(modelData.noteId) }
                }
            }
        }
        Text {
            visible: page.recentNotes.length === 0 && page.continueNote !== null
            text: "No other recent notes"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.footer
            color: Ui.ink30
            Layout.bottomMargin: 28
        }

        // ── Tasks ─────────────────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            Layout.bottomMargin: 4
            Text {
                text: "Tasks"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.meta
                font.bold: true
                color: Ui.ink70
            }
            Item { Layout.fillWidth: true }
            Text {
                objectName: "today.tasks.viewAll"
                text: "View all"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.meta
                color: Ui.ink70
                MouseArea { anchors.fill: parent; anchors.margins: -16; onClicked: page.openTasks() }
            }
        }
        Column {
            Layout.fillWidth: true
            Layout.bottomMargin: 8

            Repeater {
                model: page.previewTasks
                delegate: Item {
                    objectName: "today.task.row." + (modelData.id !== undefined ? modelData.id : index)
                    width: parent.width
                    height: 88

                    Rectangle { anchors.left: parent.left; anchors.right: parent.right; anchors.top: parent.top; height: 1; color: Ui.ink30 }

                    RowLayout {
                        anchors.fill: parent
                        spacing: 16
                        Rectangle {
                            Layout.preferredWidth: 28
                            Layout.preferredHeight: 28
                            border.width: 2
                            border.color: modelData.completed ? Ui.ink30 : Ui.ink70
                            color: modelData.completed ? Ui.ink30 : "transparent"
                        }
                        Text {
                            Layout.fillWidth: true
                            text: modelData.title !== undefined ? modelData.title : String(modelData)
                            font.family: Ui.fontFamily
                            font.pixelSize: Ui.task
                            font.strikeout: modelData.completed === true
                            color: modelData.completed ? Ui.ink30 : Ui.ink100
                            elide: Text.ElideRight
                        }
                    }
                }
            }
        }
        Text {
            visible: page.allTasks.length === 0
            text: "Nothing scheduled today"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.task
            color: Ui.ink70
            Layout.preferredHeight: 88
        }

        Item { Layout.fillHeight: true }

        // ── Exceptional status only ──────────────────────────────
        Text {
            Layout.fillWidth: true
            visible: apiClient.isLoading || apiClient.errorMessage !== ""
            text: apiClient.isLoading ? "Loading saved data…"
                  : (apiClient.errorMessage !== "" ? "Offline · showing saved data" : "")
            font.family: Ui.fontFamily
            font.pixelSize: Ui.footer
            color: Ui.ink70
            elide: Text.ElideRight
        }
    }
}
