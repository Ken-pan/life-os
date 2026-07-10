import QtQuick
import QtQuick.Layouts

// Home: a typographic planner page. Pick up the device, know in 3 seconds
// what time it is, what to do next, what's in focus, what's still open.
// No cards. No borders. Hierarchy through type size, weight, and dividers.
Item {
    id: page

    readonly property var tasks: apiClient.dashboardData.tasks ? apiClient.dashboardData.tasks : []
    readonly property var nextAction: {
        for (var i = 0; i < tasks.length; i++) {
            if (!tasks[i].completed)
                return tasks[i]
        }
        return null
    }
    readonly property int openCount: tasks.filter(function(t) { return !t.completed }).length
    readonly property var calendarCache: apiClient.readCacheFile("calendar")
    readonly property var mailCache: apiClient.readCacheFile("mail")

    property string clock: ""
    property string weekday: ""

    Timer {
        // Paused during native ink mode: a clock tick would swap the shell's
        // scenegraph over the ink runtime's framebuffer.
        interval: 30000; running: !inkMode.active; repeat: true; triggeredOnStart: true
        onTriggered: {
            var now = new Date()
            page.clock = now.toLocaleTimeString(Qt.locale(), "HH:mm")
            page.weekday = now.toLocaleDateString(Qt.locale(), "ddd MMM dd")
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // ── CLOCK ──────────────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            Layout.bottomMargin: 12

            Text {
                text: page.clock
                font.family: Ui.fontFamily
                font.pixelSize: Ui.homeTime
                font.weight: Font.Light
                color: Ui.ink
            }
            Item { Layout.fillWidth: true }
            Text {
                text: page.weekday
                font.family: Ui.fontFamily
                font.pixelSize: Ui.meta
                color: Ui.muted
                Layout.alignment: Qt.AlignBottom
                Layout.bottomMargin: 18
            }
        }

        // ── divider ────────────────────────────────────────────
        Rectangle { Layout.fillWidth: true; height: 1; color: Ui.divider }

        // ── NOW ────────────────────────────────────────────────
        Item { Layout.preferredHeight: Ui.gap }
        Text {
            text: "NOW"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.section
            font.bold: true
            font.letterSpacing: 4
            color: Ui.muted
        }
        Item { Layout.preferredHeight: 8 }
        Text {
            text: page.nextAction ? page.nextAction.title : "All clear"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.primary
            font.bold: true
            color: Ui.ink
            wrapMode: Text.WordWrap
            maximumLineCount: 2
            elide: Text.ElideRight
            Layout.fillWidth: true
        }
        Text {
            text: {
                var events = page.calendarCache.events
                if (events && events.length > 0)
                    return events[0].title + (events[0].start ? " · " + events[0].start : "")
                return ""
            }
            visible: text !== ""
            font.family: Ui.fontFamily
            font.pixelSize: Ui.meta
            color: Ui.muted
            elide: Text.ElideRight
            Layout.fillWidth: true
            Layout.topMargin: 8
        }

        // ── divider ────────────────────────────────────────────
        Item { Layout.preferredHeight: Ui.gap }
        Rectangle { Layout.fillWidth: true; height: 1; color: Ui.divider }

        // ── FOCUS ──────────────────────────────────────────────
        Item { Layout.preferredHeight: Ui.gap }
        Text {
            text: "FOCUS"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.section
            font.bold: true
            font.letterSpacing: 4
            color: Ui.muted
        }
        Item { Layout.preferredHeight: 8 }
        Text {
            text: apiClient.dashboardData.today && apiClient.dashboardData.today.currentFocus && apiClient.dashboardData.today.currentFocus.title ? apiClient.dashboardData.today.currentFocus.title : "No current focus"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.primary
            font.bold: true
            color: Ui.ink
            wrapMode: Text.WordWrap
            maximumLineCount: 2
            elide: Text.ElideRight
            Layout.fillWidth: true
        }

        // ── divider ────────────────────────────────────────────
        Item { Layout.preferredHeight: Ui.gap }
        Rectangle { Layout.fillWidth: true; height: 1; color: Ui.divider }

        // ── OPEN LOOPS (single summary line) ───────────────────
        Item { Layout.preferredHeight: Ui.gap }
        Text {
            readonly property int inbox: apiClient.dashboardData.inbox && apiClient.dashboardData.inbox.count !== undefined ? apiClient.dashboardData.inbox.count : 0
            readonly property int mail: page.mailCache.messages ? page.mailCache.messages.length : 0
            text: page.openCount + " open · " + inbox + " inbox · " + actionQueue.pendingCount + " pending"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.task
            color: Ui.ink
        }

        // ── spacer ─────────────────────────────────────────────
        Item { Layout.fillHeight: true }

        // ── STATUS FOOTER (one quiet line) ─────────────────────
        Text {
            Layout.fillWidth: true
            text: (apiClient.isLoading ? "syncing"
                   : (apiClient.errorMessage !== "" ? "offline"
                                                    : "synced " + apiClient.lastSync))
                  + " · " + refreshControl.mode
            font.family: Ui.fontFamily
            font.pixelSize: Ui.footer
            color: Ui.muted
            elide: Text.ElideRight
        }
    }
}
