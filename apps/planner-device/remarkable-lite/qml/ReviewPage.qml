import QtQuick
import QtQuick.Layouts

// Review: the daily shutdown loop. v0 is a status mirror — done counts,
// pending queue, notes captured — not yet an interactive checklist.
Item {
    id: page

    // Lets the shutdown checklist jump straight to the module it names.
    signal navigateTo(int module)

    readonly property var tasks: apiClient.dashboardData.tasks ? apiClient.dashboardData.tasks : []
    readonly property int doneCount: tasks.filter(function(t) { return t.completed === true }).length

    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.gap

        Text {
            text: "Daily Review"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.fontSection
            font.bold: true
            color: Ui.ink
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 230
            color: Ui.card
            radius: Ui.radius
            border.width: 1
            border.color: Ui.line

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: Ui.cardPadding
                spacing: 10
                Text {
                    text: "TODAY SO FAR"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontMeta
                    font.bold: true
                    color: Ui.accent
                }
                StatusLine { label: "Done today"; value: page.doneCount + " / " + page.tasks.length }
                StatusLine { label: "Still open"; value: String(page.tasks.length - page.doneCount) }
                StatusLine { label: "Notes captured"; value: String(noteStore.noteCount) }
                StatusLine { label: "Actions awaiting sync"; value: String(actionQueue.pendingCount) }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 240
            color: Ui.card
            radius: Ui.radius
            border.width: 1
            border.color: Ui.line

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: Ui.cardPadding
                spacing: 8
                Text {
                    text: "SHUTDOWN CHECKLIST"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontMeta
                    font.bold: true
                    color: Ui.accent
                }
                Repeater {
                    model: [
                        "Clear Today list — complete or defer everything",
                        "Capture loose ends as Quick Notes",
                        "Check pending sync actions reached zero",
                        "Pick tomorrow's focus in Planner",
                    ]
                    delegate: Text {
                        text: "•  " + modelData
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.fontMeta
                        color: Ui.ink
                        wrapMode: Text.WordWrap
                        Layout.fillWidth: true
                    }
                }
            }
        }

        Item { Layout.fillHeight: true }

        Text {
            text: "Weekly review and drift analysis land with the backend review feed."
            font.family: Ui.fontFamily
            font.pixelSize: Ui.fontMeta
            color: Ui.faintInk
        }
    }
}
