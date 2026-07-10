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
                spacing: 12

                Repeater {
                    model: page.pageTasks

                    delegate: Rectangle {
                        readonly property string key: page.taskKey(modelData, index)
                        readonly property bool isDone: modelData.completed === true || page.locallyCompleted[key] === true
                        readonly property bool isDeferred: page.locallyDeferred[key] === true

                        width: parent.width
                        height: 118
                        color: Ui.card
                        radius: Ui.radius
                        border.width: 1
                        border.color: Ui.line
                        opacity: isDeferred ? 0.45 : 1.0

                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: Ui.cardPadding
                            spacing: Ui.gap

                            // Checkbox → task.complete into the queue
                            Rectangle {
                                width: 44
                                height: 44
                                radius: 8
                                border.width: 2
                                border.color: isDone ? Ui.ink : Ui.faintInk
                                color: isDone ? Ui.ink : "transparent"

                                Text {
                                    anchors.centerIn: parent
                                    visible: isDone
                                    text: "✓"
                                    font.pixelSize: 30
                                    color: Ui.card
                                }

                                MouseArea {
                                    anchors.fill: parent
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
                                spacing: 4
                                Text {
                                    text: modelData.title !== undefined ? modelData.title : modelData
                                    font.family: Ui.fontFamily
                                    font.pixelSize: Ui.fontBody
                                    font.strikeout: isDone
                                    color: isDone ? Ui.faintInk : Ui.ink
                                    elide: Text.ElideRight
                                    Layout.fillWidth: true
                                }
                                Text {
                                    text: (modelData.priority ? modelData.priority : "P3") + (modelData.dueTime ? " · " + modelData.dueTime : "") + (isDeferred ? " · deferred" : "")
                                    font.family: Ui.fontFamily
                                    font.pixelSize: Ui.fontMeta
                                    color: Ui.mutedInk
                                }
                            }

                            PaperButton {
                                label: "Defer"
                                fontSize: Ui.fontMeta
                                implicitHeight: 52
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
            spacing: 40
            visible: page.allTasks.length > page.pageSize

            PaperButton {
                label: "‹  Prev"
                enabled: page.pageIndex > 0
                implicitWidth: 180
                onTapped: { page.pageIndex = Math.max(0, page.pageIndex - 1); refreshControl.pageUpdated() }
            }
            Text {
                text: (page.pageIndex + 1) + " / " + page.pageCount
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontSection
                color: Ui.mutedInk
            }
            PaperButton {
                label: "Next  ›"
                enabled: page.pageIndex < page.pageCount - 1
                implicitWidth: 180
                onTapped: { page.pageIndex = Math.min(page.pageCount - 1, page.pageIndex + 1); refreshControl.pageUpdated() }
            }
        }

        // STATUS FOOTER
        RowLayout {
            Layout.fillWidth: true
            Text {
                text: apiClient.isLoading ? "Syncing..." : ("Synced " + (apiClient.lastSync !== "" ? apiClient.lastSync : "never"))
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontMeta
                color: Ui.mutedInk
            }
            Item { Layout.fillWidth: true }
            Text {
                text: "pending " + actionQueue.pendingCount + " · " + refreshControl.mode + " refresh"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontMeta
                color: Ui.mutedInk
            }
        }
    }
}
