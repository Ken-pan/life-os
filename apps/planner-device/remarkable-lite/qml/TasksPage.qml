import QtQuick
import QtQuick.Layouts

// TasksPage — the full Tasks destination (PAPR.UI.2 §2.4), extracted from the
// legacy TodayPage checklist. A paper checklist: items separated by dividers,
// tapping a row selects it, an action strip appears at the bottom. Checkbox
// completes immediately. This is the Today preview's "View all" target — it
// does not absorb legacy Inbox/Review behavior in this slice.
Item {
    id: page

    readonly property int pageSize: 5
    property int pageIndex: 0
    property int selectedIndex: -1
    property var locallyCompleted: ({})
    property var locallyDeferred: ({})

    readonly property var allTasks: apiClient.dashboardData.tasks ? apiClient.dashboardData.tasks : []
    readonly property int pageCount: Math.max(1, Math.ceil(allTasks.length / pageSize))
    readonly property var pageTasks: allTasks.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize)

    onAllTasksChanged: {
        if (pageIndex > pageCount - 1)
            pageIndex = Math.max(0, pageCount - 1)
        selectedIndex = -1
    }

    function taskKey(task, index) {
        return task.id !== undefined ? String(task.id) : "row-" + (pageIndex * pageSize + index)
    }

    function completeSelected() {
        if (selectedIndex < 0 || selectedIndex >= pageTasks.length) return
        var t = pageTasks[selectedIndex]
        var k = taskKey(t, selectedIndex)
        if (actionQueue.enqueue("task.complete", { id: t.id !== undefined ? t.id : k, title: t.title !== undefined ? t.title : String(t) })) {
            var done = locallyCompleted; done[k] = true; locallyCompleted = done
        }
        selectedIndex = -1
    }

    function deferSelected() {
        if (selectedIndex < 0 || selectedIndex >= pageTasks.length) return
        var t = pageTasks[selectedIndex]
        var k = taskKey(t, selectedIndex)
        if (actionQueue.enqueue("task.defer", { id: t.id !== undefined ? t.id : k, title: t.title !== undefined ? t.title : String(t) })) {
            var def = locallyDeferred; def[k] = true; locallyDeferred = def
        }
        selectedIndex = -1
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // ── focus/context line (real data only) ─────────────────
        Text {
            visible: apiClient.dashboardData.today && apiClient.dashboardData.today.currentFocus && apiClient.dashboardData.today.currentFocus.title
            text: "Focus · " + (apiClient.dashboardData.today && apiClient.dashboardData.today.currentFocus ? apiClient.dashboardData.today.currentFocus.title : "")
            font.family: Ui.fontFamily
            font.pixelSize: Ui.section
            font.bold: true
            color: Ui.ink100
            elide: Text.ElideRight
            Layout.fillWidth: true
            Layout.bottomMargin: 12
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: Ui.ink30 }

        // ── TASK LIST ──────────────────────────────────────────
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            Column {
                anchors.top: parent.top
                width: parent.width

                Repeater {
                    model: page.pageTasks

                    delegate: Item {
                        readonly property string key: page.taskKey(modelData, index)
                        objectName: "task.row." + key
                        readonly property bool isDone: modelData.completed === true || page.locallyCompleted[key] === true
                        readonly property bool isDeferred: page.locallyDeferred[key] === true
                        readonly property bool isSelected: page.selectedIndex === index
                        readonly property string priority: modelData.priority ? modelData.priority : ""

                        width: parent.width
                        height: taskRow.implicitHeight + 24 + 1
                        opacity: isDeferred ? 0.35 : 1.0

                        Rectangle {
                            anchors.fill: parent
                            anchors.bottomMargin: 1
                            color: isSelected ? "#EEEEEE" : "transparent"
                        }

                        RowLayout {
                            id: taskRow
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.verticalCenter: parent.verticalCenter
                            anchors.verticalCenterOffset: -1
                            spacing: 20

                            Rectangle {
                                objectName: "task.checkbox." + key
                                Layout.preferredWidth: Ui.cbSize
                                Layout.preferredHeight: Ui.cbSize
                                radius: 0
                                border.width: 2
                                border.color: isDone ? Ui.ink100 : Ui.ink70
                                color: isDone ? Ui.ink100 : "transparent"

                                Text {
                                    anchors.centerIn: parent
                                    visible: isDone
                                    text: "✓"
                                    font.pixelSize: Ui.task
                                    font.bold: true
                                    color: Ui.paper
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    anchors.margins: -12
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

                            Text {
                                Layout.fillWidth: true
                                text: modelData.title !== undefined ? modelData.title : modelData
                                font.family: Ui.fontFamily
                                font.pixelSize: Ui.task
                                font.strikeout: isDone
                                color: isDone ? Ui.ink30 : Ui.ink100
                                wrapMode: Text.WordWrap
                                maximumLineCount: 2
                                elide: Text.ElideRight
                            }

                            Text {
                                visible: priority !== "" && priority !== "P3"
                                text: priority
                                font.family: Ui.fontFamily
                                font.pixelSize: Ui.meta
                                font.bold: priority === "P0" || priority === "P1"
                                color: isDone ? Ui.ink30 : Ui.ink100
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            z: -1
                            onClicked: {
                                if (page.selectedIndex === index)
                                    page.selectedIndex = -1
                                else
                                    page.selectedIndex = index
                            }
                        }

                        Rectangle {
                            anchors.bottom: parent.bottom
                            width: parent.width
                            height: 1
                            color: Ui.ink30
                        }
                    }
                }
            }

            Text {
                anchors.centerIn: parent
                visible: page.allTasks.length === 0
                text: apiClient.isLoading ? "Loading tasks…" : "Nothing scheduled today"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.task
                color: Ui.ink70
            }
        }

        // ── ACTION STRIP ────────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.btnH
            visible: page.selectedIndex >= 0
            spacing: Ui.gap

            Item { Layout.fillWidth: true }
            PaperButton {
                label: "Complete"
                implicitHeight: Ui.btnH
                onTapped: page.completeSelected()
            }
            PaperButton {
                label: "Defer"
                secondary: true
                implicitHeight: Ui.btnH
                onTapped: page.deferSelected()
            }
            Item { Layout.fillWidth: true }
        }

        // ── PAGER ────────────────────────────────────────────────
        RowLayout {
            Layout.alignment: Qt.AlignHCenter
            Layout.preferredHeight: Ui.btnH
            spacing: 48
            visible: page.selectedIndex < 0 && page.allTasks.length > page.pageSize

            PaperButton {
                label: "‹ Prev"
                secondary: true
                enabled: page.pageIndex > 0
                implicitWidth: 180
                implicitHeight: Ui.btnHs
                onTapped: { page.pageIndex = Math.max(0, page.pageIndex - 1); refreshControl.pageUpdated() }
            }
            Text {
                text: (page.pageIndex + 1) + " / " + page.pageCount
                font.family: Ui.fontFamily
                font.pixelSize: Ui.meta
                color: Ui.ink100
            }
            PaperButton {
                label: "Next ›"
                secondary: true
                enabled: page.pageIndex < page.pageCount - 1
                implicitWidth: 180
                implicitHeight: Ui.btnHs
                onTapped: { page.pageIndex = Math.min(page.pageCount - 1, page.pageIndex + 1); refreshControl.pageUpdated() }
            }
        }

        // ── STATUS FOOTER ──────────────────────────────────────
        Text {
            Layout.fillWidth: true
            Layout.topMargin: 8
            visible: apiClient.isLoading || apiClient.errorMessage !== ""
            text: (apiClient.isLoading ? "Loading…" : "Offline · showing saved data")
                  + (actionQueue.pendingCount > 0 ? " · pending " + actionQueue.pendingCount : "")
            font.family: Ui.fontFamily
            font.pixelSize: Ui.footer
            color: Ui.ink70
            elide: Text.ElideRight
        }
    }
}
