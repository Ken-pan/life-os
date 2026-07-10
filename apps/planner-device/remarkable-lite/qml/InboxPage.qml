import QtQuick
import QtQuick.Layouts

// Inbox: everything waiting on a decision — mail needing action,
// planner task inbox, unprocessed notes, sync queue.
Item {
    id: page

    readonly property var mailCache: apiClient.readCacheFile("mail")
    readonly property var messages: mailCache.messages ? mailCache.messages : []
    readonly property int plannerInbox: apiClient.dashboardData.inbox && apiClient.dashboardData.inbox.count !== undefined ? apiClient.dashboardData.inbox.count : -1

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // ── header summary ─────────────────────────────────────
        Text {
            text: "WAITING ON YOU"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.section
            font.bold: true
            font.letterSpacing: 4
            color: Ui.muted
            Layout.bottomMargin: 12
        }

        Text {
            text: page.messages.length + " mail · "
                + (page.plannerInbox >= 0 ? page.plannerInbox : 0) + " inbox · "
                + actionQueue.pendingCount + " pending"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.task
            color: Ui.ink
            Layout.bottomMargin: Ui.gap
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: Ui.divider }

        // ── mail list ──────────────────────────────────────────
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            Column {
                anchors.top: parent.top
                width: parent.width

                Repeater {
                    model: page.messages.slice(0, 5)

                    delegate: Item {
                        width: parent.width
                        height: 120

                        RowLayout {
                            anchors.fill: parent
                            anchors.topMargin: 12
                            anchors.bottomMargin: 12
                            spacing: Ui.gap

                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 6
                                Text {
                                    text: modelData.subject !== undefined ? modelData.subject : "(no subject)"
                                    font.family: Ui.fontFamily
                                    font.pixelSize: Ui.task
                                    color: Ui.ink
                                    elide: Text.ElideRight
                                    Layout.fillWidth: true
                                }
                                Text {
                                    text: (modelData.from !== undefined ? modelData.from : "") + (modelData.summary ? " · " + modelData.summary : "")
                                    font.family: Ui.fontFamily
                                    font.pixelSize: Ui.meta
                                    color: Ui.muted
                                    elide: Text.ElideRight
                                    Layout.fillWidth: true
                                }
                            }

                            PaperButton {
                                label: "→ Task"
                                secondary: true
                                implicitHeight: Ui.btnHs
                                onTapped: actionQueue.enqueue("mail.convert_to_task", { messageId: modelData.id !== undefined ? modelData.id : "", subject: modelData.subject !== undefined ? modelData.subject : "" })
                            }
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

            ColumnLayout {
                anchors.centerIn: parent
                visible: page.messages.length === 0
                spacing: 8
                Text {
                    text: "Nothing waiting"
                    horizontalAlignment: Text.AlignHCenter
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.task
                    color: Ui.muted
                    Layout.alignment: Qt.AlignHCenter
                }
            }
        }

        // ── footer ─────────────────────────────────────────────
        Text {
            text: "pending " + actionQueue.pendingCount + " · " + refreshControl.mode
            font.family: Ui.fontFamily
            font.pixelSize: Ui.footer
            color: Ui.muted
        }
    }
}
