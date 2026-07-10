import QtQuick
import QtQuick.Layouts

// Home: pick the device up, know in 3 seconds — what time it is, what to
// do next, what's in focus, what's still open. Four blocks, no debug.
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

    Timer {
        interval: 30000; running: true; repeat: true; triggeredOnStart: true
        onTriggered: page.clock = new Date().toLocaleTimeString(Qt.locale(), "HH:mm")
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.gap

        // CLOCK — the anchor of the page
        RowLayout {
            Layout.fillWidth: true
            Text {
                text: page.clock
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontClock
                font.bold: true
                color: Ui.ink
            }
            Item { Layout.fillWidth: true }
            Text {
                text: apiClient.dashboardData.today ? apiClient.dashboardData.today.date : ""
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontSection
                color: Ui.mutedInk
                Layout.alignment: Qt.AlignBottom
                Layout.bottomMargin: 14
            }
        }

        // NOW — the single next action
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 190
            color: Ui.card
            radius: Ui.radius
            border.width: 2
            border.color: Ui.lineStrong

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: Ui.cardPadding
                spacing: 10
                Text {
                    text: "NOW"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontMeta
                    font.bold: true
                    color: Ui.accent
                }
                Text {
                    text: page.nextAction ? page.nextAction.title : "All clear"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontFocus
                    font.bold: true
                    color: Ui.ink
                    elide: Text.ElideRight
                    maximumLineCount: 2
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
                Text {
                    text: {
                        var events = page.calendarCache.events
                        if (events && events.length > 0)
                            return "Next event · " + events[0].title + (events[0].start ? " · " + events[0].start : "")
                        return "No upcoming events"
                    }
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontMeta
                    color: Ui.mutedInk
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
            }
        }

        // FOCUS — thick border, the visual anchor below the clock
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 180
            color: Ui.card
            radius: Ui.radius
            border.width: 4
            border.color: Ui.lineStrong

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: Ui.cardPadding
                spacing: 10
                Text {
                    text: "FOCUS"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontMeta
                    font.bold: true
                    color: Ui.accent
                }
                Text {
                    text: apiClient.dashboardData.today && apiClient.dashboardData.today.currentFocus && apiClient.dashboardData.today.currentFocus.title ? apiClient.dashboardData.today.currentFocus.title : "No current focus"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontFocus
                    font.bold: true
                    color: Ui.ink
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
            }
        }

        // OPEN LOOPS — the numbers that decide the day
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 250
            color: Ui.card
            radius: Ui.radius
            border.width: 1
            border.color: Ui.line

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: Ui.cardPadding
                spacing: 12
                Text {
                    text: "OPEN LOOPS"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontMeta
                    font.bold: true
                    color: Ui.accent
                }
                StatusLine {
                    label: "Today tasks"
                    value: page.openCount + " open of " + page.tasks.length
                }
                StatusLine {
                    label: "Inbox"
                    value: apiClient.dashboardData.inbox && apiClient.dashboardData.inbox.count !== undefined ? String(apiClient.dashboardData.inbox.count) : "—"
                }
                StatusLine {
                    label: "Mail needing action"
                    value: page.mailCache.messages ? String(page.mailCache.messages.length) : "—"
                }
                StatusLine {
                    label: "Pending sync"
                    value: String(actionQueue.pendingCount)
                }
            }
        }

        Item { Layout.fillHeight: true }

        // STATUS — one quiet line; detail lives in System / Quick Settings
        Text {
            Layout.fillWidth: true
            text: (apiClient.isLoading ? "syncing"
                   : (apiClient.errorMessage !== "" ? "offline · last sync " + apiClient.lastSync
                                                    : "synced " + apiClient.lastSync))
                  + (deviceStatus.batteryPercent >= 0 ? " · battery " + deviceStatus.batteryPercent + "%" : "")
                  + " · " + refreshControl.mode + " refresh"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.fontFooter
            color: Ui.mutedInk
            elide: Text.ElideRight
        }
    }
}
