import QtQuick
import QtQuick.Layouts

// Mail triage, not a mail client: read the important few, convert to
// tasks. Reads cache/mail.json written by the (future) sync helper; the
// backend feed is a later phase, so the empty state explains itself.
Item {
    id: page

    readonly property var mailCache: apiClient.readCacheFile("mail")
    readonly property var messages: mailCache.messages ? mailCache.messages : []

    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.gap

        Text {
            text: "Mail Triage"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.fontSection
            font.bold: true
            color: Ui.ink
        }

        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            Column {
                anchors.top: parent.top
                width: parent.width
                spacing: 12

                Repeater {
                    model: page.messages.slice(0, 5)

                    delegate: Rectangle {
                        width: parent.width
                        height: 130
                        color: Ui.card
                        radius: Ui.radius
                        border.width: 1
                        border.color: Ui.line

                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: Ui.cardPadding
                            spacing: Ui.gap

                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 4
                                Text {
                                    text: modelData.subject !== undefined ? modelData.subject : "(no subject)"
                                    font.family: Ui.fontFamily
                                    font.pixelSize: Ui.fontBody
                                    color: Ui.ink
                                    elide: Text.ElideRight
                                    Layout.fillWidth: true
                                }
                                Text {
                                    text: (modelData.from !== undefined ? modelData.from : "") + (modelData.summary ? " · " + modelData.summary : "")
                                    font.family: Ui.fontFamily
                                    font.pixelSize: Ui.fontMeta
                                    color: Ui.mutedInk
                                    elide: Text.ElideRight
                                    Layout.fillWidth: true
                                }
                            }

                            PaperButton {
                                label: "→ Task"
                                fontSize: Ui.fontMeta
                                implicitHeight: 52
                                onTapped: actionQueue.enqueue("mail.convert_to_task", { messageId: modelData.id !== undefined ? modelData.id : "", subject: modelData.subject !== undefined ? modelData.subject : "" })
                            }
                        }
                    }
                }
            }

            ColumnLayout {
                anchors.centerIn: parent
                visible: page.messages.length === 0
                spacing: 8
                Text {
                    text: "No mail cache yet"
                    horizontalAlignment: Text.AlignHCenter
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontBody
                    color: Ui.faintInk
                    Layout.alignment: Qt.AlignHCenter
                }
                Text {
                    text: "The LifeOS backend mail feed lands in a later phase.\nThis page reads cache/mail.json when it exists."
                    horizontalAlignment: Text.AlignHCenter
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontMeta
                    color: Ui.faintInk
                    Layout.alignment: Qt.AlignHCenter
                }
            }
        }

        Text {
            text: "Convert-to-task actions queue offline · pending " + actionQueue.pendingCount
            font.family: Ui.fontFamily
            font.pixelSize: Ui.fontMeta
            color: Ui.mutedInk
        }
    }
}
