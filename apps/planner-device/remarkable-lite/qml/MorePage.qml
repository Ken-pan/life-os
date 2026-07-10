import QtQuick
import QtQuick.Layouts

// More: navigation hub for secondary modules.
// Large tap targets, minimal chrome. This replaces the 6-tab approach.
Item {
    id: page

    signal openModule(int module)

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // ── title ──────────────────────────────────────────────
        Text {
            text: "More"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.primary
            font.bold: true
            color: Ui.ink
            Layout.bottomMargin: Ui.gap
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: Ui.divider }

        // ── nav items ──────────────────────────────────────────
        Repeater {
            // module indices: 3=Inbox, 4=Review, 5=System
            model: [
                { label: "Inbox",    desc: "Mail & tasks waiting on you",  mod: 3 },
                { label: "Review",   desc: "Daily shutdown checklist",     mod: 4 },
                { label: "System",   desc: "Sync, display & device info",  mod: 5 },
            ]

            delegate: Item {
                objectName: "more." + modelData.label.toLowerCase()
                Layout.fillWidth: true
                height: 120

                ColumnLayout {
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 6

                    Text {
                        text: modelData.label
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.task
                        font.bold: true
                        color: Ui.ink
                    }
                    Text {
                        text: modelData.desc
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.meta
                        color: Ui.muted
                    }
                }

                MouseArea {
                    anchors.fill: parent
                    onClicked: page.openModule(modelData.mod)
                }

                Rectangle {
                    anchors.bottom: parent.bottom
                    width: parent.width
                    height: 1
                    color: Ui.divider
                }
            }
        }

        Item { Layout.fillHeight: true }

        // ── Return to reMarkable ───────────────────────────────
        Rectangle { Layout.fillWidth: true; height: 1; color: Ui.divider }
        Item { Layout.preferredHeight: Ui.gap }

        PaperButton {
            objectName: "more.returnRemarkable"
            label: "Return to reMarkable"
            Layout.fillWidth: true
            implicitHeight: Ui.btnH
            onTapped: Qt.quit()
        }

        Item { Layout.preferredHeight: Ui.gap }

        Text {
            text: "PaperOS · " + Ui.scale + " · " + deviceStatus.appVersion
            font.family: Ui.fontFamily
            font.pixelSize: Ui.footer
            color: Ui.muted
        }
    }
}
