import QtQuick
import QtQuick.Layouts

// Home: pick the device up, know in 3 seconds how today goes.
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

        // NOW
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 170
            color: Ui.card
            radius: Ui.radius
            border.width: 2
            border.color: Ui.line

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: Ui.cardPadding
                spacing: 6

                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        text: page.clock
                        font.family: Ui.fontFamily
                        font.pixelSize: 56
                        font.bold: true
                        color: Ui.ink
                    }
                    Item { Layout.fillWidth: true }
                    Text {
                        text: apiClient.dashboardData.today ? apiClient.dashboardData.today.date : ""
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.fontMeta
                        color: Ui.mutedInk
                    }
                }
                Text {
                    text: {
                        var events = page.calendarCache.events
                        if (events && events.length > 0)
                            return "Next event: " + events[0].title + (events[0].start ? " · " + events[0].start : "")
                        return "Next event: no calendar data"
                    }
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontMeta
                    color: Ui.mutedInk
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
                Text {
                    text: page.nextAction ? "Next action: " + page.nextAction.title : "Next action: all clear"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontBody
                    color: Ui.ink
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
            }
        }

        // TODAY FOCUS
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 150
            color: Ui.card
            radius: Ui.radius
            border.width: 2
            border.color: Ui.line

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: Ui.cardPadding
                spacing: 6
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

        // OPEN LOOPS
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 190
            color: Ui.card
            radius: Ui.radius
            border.width: 1
            border.color: Ui.line

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: Ui.cardPadding
                spacing: 8
                Text {
                    text: "OPEN LOOPS"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontMeta
                    font.bold: true
                    color: Ui.accent
                }
                StatusLine {
                    label: "Tasks today"
                    value: page.tasks.length + " (" + page.tasks.filter(function(t) { return t.completed }).length + " done)"
                }
                StatusLine {
                    label: "Inbox"
                    value: apiClient.dashboardData.inbox && apiClient.dashboardData.inbox.count !== undefined ? String(apiClient.dashboardData.inbox.count) : "—"
                }
                StatusLine {
                    label: "Mail needing action"
                    value: page.mailCache.messages ? String(page.mailCache.messages.length) : "no mail cache"
                }
                StatusLine {
                    label: "Pending sync actions"
                    value: String(actionQueue.pendingCount)
                }
            }
        }

        Item { Layout.fillHeight: true }

        // DEVICE STATUS
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 130
            color: "transparent"
            radius: Ui.radius
            border.width: 1
            border.color: Ui.line

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: Ui.cardPadding
                spacing: 6
                StatusLine {
                    label: "Battery"
                    value: deviceStatus.batteryPercent >= 0 ? deviceStatus.batteryPercent + "% " + deviceStatus.batteryState : "unknown"
                }
                StatusLine {
                    label: "Sync"
                    value: apiClient.isLoading ? "syncing..." : (apiClient.errorMessage !== "" ? "offline/stale · last " + apiClient.lastSync : "fresh · " + apiClient.lastSync)
                }
                StatusLine {
                    label: "Refresh mode"
                    value: refreshControl.mode
                }
            }
        }
    }
}
