import QtQuick
import QtQuick.Layouts

// Review: daily shutdown loop — 4 steps, each with status and action.
Item {
    id: page

    signal navigateTo(int module)

    readonly property var tasks: apiClient.dashboardData.tasks ? apiClient.dashboardData.tasks : []
    readonly property int doneCount: tasks.filter(function(t) { return t.completed === true }).length
    readonly property int openCount: tasks.length - doneCount

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        Text {
            text: "Daily Shutdown"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.primary
            font.bold: true
            color: Ui.ink
            Layout.bottomMargin: Ui.gap
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: Ui.divider }

        // ── Step 1 ─────────────────────────────────────────────
        Item {
            Layout.fillWidth: true
            height: 110

            RowLayout {
                anchors.fill: parent
                spacing: Ui.gap

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 6
                    Text {
                        text: "1  Clear Today"
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.task
                        font.bold: true
                        color: Ui.ink
                    }
                    Text {
                        text: page.openCount + " still open"
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.meta
                        color: page.openCount > 0 ? Ui.ink : Ui.muted
                    }
                }
                PaperButton {
                    label: "Review"
                    secondary: page.openCount === 0
                    implicitHeight: Ui.btnHs
                    onTapped: page.navigateTo(0)
                }
            }

            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Ui.divider }
        }

        // ── Step 2 ─────────────────────────────────────────────
        Item {
            Layout.fillWidth: true
            height: 110

            RowLayout {
                anchors.fill: parent
                spacing: Ui.gap

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 6
                    Text {
                        text: "2  Process Notes"
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.task
                        font.bold: true
                        color: Ui.ink
                    }
                    Text {
                        text: noteStore.noteCount + " notes captured"
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.meta
                        color: noteStore.noteCount > 0 ? Ui.ink : Ui.muted
                    }
                }
                PaperButton {
                    label: "Notes"
                    secondary: noteStore.noteCount === 0
                    implicitHeight: Ui.btnHs
                    onTapped: page.navigateTo(1)
                }
            }

            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Ui.divider }
        }

        // ── Step 3 ─────────────────────────────────────────────
        Item {
            Layout.fillWidth: true
            height: 110

            RowLayout {
                anchors.fill: parent
                spacing: Ui.gap

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 6
                    Text {
                        text: "3  Sync"
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.task
                        font.bold: true
                        color: Ui.ink
                    }
                    Text {
                        text: actionQueue.pendingCount + " pending"
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.meta
                        color: actionQueue.pendingCount > 0 ? Ui.ink : Ui.muted
                    }
                }
                PaperButton {
                    label: "Sync now"
                    secondary: actionQueue.pendingCount === 0
                    implicitHeight: Ui.btnHs
                    onTapped: actionQueue.sync()
                }
            }

            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Ui.divider }
        }

        // ── Step 4 ─────────────────────────────────────────────
        Item {
            Layout.fillWidth: true
            height: 110

            RowLayout {
                anchors.fill: parent
                spacing: Ui.gap

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 6
                    Text {
                        text: "4  Pick Tomorrow Focus"
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.task
                        font.bold: true
                        color: Ui.ink
                    }
                    Text {
                        text: "Set priority in Planner"
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.meta
                        color: Ui.muted
                    }
                }
                PaperButton {
                    label: "Choose"
                    secondary: true
                    implicitHeight: Ui.btnHs
                    onTapped: page.navigateTo(0)
                }
            }

            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Ui.divider }
        }

        Item { Layout.fillHeight: true }
    }
}
