import QtQuick
import QtQuick.Layouts

// Today: execution view. Paginated tasks with complete/defer wired to the
// offline action queue. Completion is optimistic-local until sync lands.
Item {
    id: page

    readonly property int pageSize: 5
    property int pageIndex: 0
    property var locallyCompleted: ({})
    property var locallyDeferred: ({})

    readonly property var allTasks: apiClient.dashboardData.tasks ? apiClient.dashboardData.tasks : []
    readonly property int pageCount: Math.max(1, Math.ceil(allTasks.length / pageSize))
    readonly property var pageTasks: allTasks.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize)

    onAllTasksChanged: {
        if (pageIndex > pageCount - 1)
            pageIndex = Math.max(0, pageCount - 1)
    }

    function taskKey(task, index) {
        return task.id !== undefined ? String(task.id) : "row-" + (pageIndex * pageSize + index)
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.gap

        // FOCUS CARD
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 160
            color: Ui.card
            radius: Ui.radius
            border.width: 3
            border.color: Ui.lineStrong

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: Ui.cardPadding
                spacing: 8
                Text {
                    text: "NOW"
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

        // TASK PAGE
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            Column {
                anchors.top: parent.top
                width: parent.width
                spacing: 14

                Repeater {
                    model: page.pageTasks

                    delegate: Rectangle {
                        readonly property string key: page.taskKey(modelData, index)
                        readonly property bool isDone: modelData.completed === true || page.locallyCompleted[key] === true
                        readonly property bool isDeferred: page.locallyDeferred[key] === true
                        readonly property string priority: modelData.priority ? modelData.priority : "P3"

                        width: parent.width
                        height: 160
                        color: Ui.card
                        radius: Ui.radius
                        border.width: 1
                        border.color: Ui.line
                        opacity: isDeferred ? 0.4 : 1.0

                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: Ui.cardPadding
                            spacing: Ui.gap

                            // Checkbox → task.complete into the queue
                            Rectangle {
                                Layout.preferredWidth: Ui.checkboxSize
                                Layout.preferredHeight: Ui.checkboxSize
                                radius: 10
                                border.width: 3
                                border.color: isDone ? Ui.ink : Ui.mutedInk
                                color: isDone ? Ui.ink : "transparent"

                                Text {
                                    anchors.centerIn: parent
                                    visible: isDone
                                    text: "✓"
                                    font.pixelSize: 42
                                    color: Ui.card
                                }

                                MouseArea {
                                    // over-size the hit area past the visual box
                                    anchors.fill: parent
                                    anchors.margins: -16
                                    enabled: !isDone
                                    onClicked: {
                                        if (actionQueue.enqueue("task.complete", { id: modelData.id !== undefined ? modelData.id : key, title: modelData.title !== undefined ? modelData.title : String(modelData) })) {
                                            var done = page.locallyCompleted
                                            done[key] = true
                                            page.locallyCompleted = done
                                        }
                                    }
                                }
                            }

                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 6
                                Text {
                                    text: modelData.title !== undefined ? modelData.title : modelData
                                    font.family: Ui.fontFamily
                                    font.pixelSize: Ui.fontBody
                                    font.strikeout: isDone
                                    color: isDone ? Ui.faintInk : Ui.ink
                                    elide: Text.ElideRight
                                    maximumLineCount: 2
                                    wrapMode: Text.WordWrap
                                    Layout.fillWidth: true
                                }
                                RowLayout {
                                    spacing: 10
                                    // Priority badge — P0/P1 inverted so urgency reads at a glance
                                    Rectangle {
                                        readonly property bool urgent: priority === "P0" || priority === "P1"
                                        width: badgeText.implicitWidth + 20
                                        height: 34
                                        radius: 6
                                        color: urgent && !isDone ? Ui.ink : "transparent"
                                        border.width: 1
                                        border.color: isDone ? Ui.line : Ui.mutedInk

                                        Text {
                                            id: badgeText
                                            anchors.centerIn: parent
                                            text: priority
                                            font.family: Ui.fontFamily
                                            font.pixelSize: Ui.fontFooter
                                            font.bold: true
                                            color: parent.urgent && !isDone ? Ui.card : Ui.mutedInk
                                        }
                                    }
                                    Text {
                                        text: (modelData.dueTime ? modelData.dueTime : "") + (isDeferred ? "  deferred" : "")
                                        font.family: Ui.fontFamily
                                        font.pixelSize: Ui.fontMeta
                                        color: Ui.mutedInk
                                        visible: text !== ""
                                    }
                                }
                            }

                            PaperButton {
                                label: "Defer"
                                fontSize: Ui.fontMeta
                                secondary: true
                                implicitHeight: Ui.buttonHeightSmall
                                visible: !isDone && !isDeferred
                                onTapped: {
                                    if (actionQueue.enqueue("task.defer", { id: modelData.id !== undefined ? modelData.id : key, title: modelData.title !== undefined ? modelData.title : String(modelData) })) {
                                        var deferred = page.locallyDeferred
                                        deferred[key] = true
                                        page.locallyDeferred = deferred
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Text {
                anchors.centerIn: parent
                visible: page.allTasks.length === 0
                text: apiClient.isLoading ? "Loading tasks..." : "No tasks for today"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontBody
                color: Ui.faintInk
            }
        }

        // PAGER
        RowLayout {
            Layout.alignment: Qt.AlignHCenter
            spacing: 48
            visible: page.allTasks.length > page.pageSize

            PaperButton {
                label: "‹  Prev"
                fontSize: Ui.fontMeta
                enabled: page.pageIndex > 0
                implicitWidth: 220
                onTapped: { page.pageIndex = Math.max(0, page.pageIndex - 1); refreshControl.pageUpdated() }
            }
            Text {
                text: (page.pageIndex + 1) + " / " + page.pageCount
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontSection
                font.bold: true
                color: Ui.ink
            }
            PaperButton {
                label: "Next  ›"
                fontSize: Ui.fontMeta
                enabled: page.pageIndex < page.pageCount - 1
                implicitWidth: 220
                onTapped: { page.pageIndex = Math.min(page.pageCount - 1, page.pageIndex + 1); refreshControl.pageUpdated() }
            }
        }

        // STATUS FOOTER
        RowLayout {
            Layout.fillWidth: true
            Text {
                text: apiClient.isLoading ? "Syncing..." : ("Synced " + (apiClient.lastSync !== "" ? apiClient.lastSync : "never"))
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontFooter
                color: Ui.mutedInk
            }
            Item { Layout.fillWidth: true }
            Text {
                text: "pending " + actionQueue.pendingCount + " · " + refreshControl.mode + " refresh"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontFooter
                color: Ui.mutedInk
            }
        }
    }
}
