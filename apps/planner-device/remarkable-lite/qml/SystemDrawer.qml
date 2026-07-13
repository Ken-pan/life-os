import QtQuick
import QtQuick.Layouts

// System drawer — the temporary Layer-1 navigation surface (brief §7.2).
// Replaces the permanent bottom tab bar. Opens from the shell menu button,
// closes after navigation or an outside tap. Discrete show/hide only: no
// animation, no translucent scrim — the underlying page stays quiet and a
// single ink100 edge marks the modal boundary.
Item {
    id: drawer
    objectName: "system.drawer"

    property bool open: false
    property int currentModule: 0

    signal navigate(int module)

    visible: open
    anchors.fill: parent

    function dismiss() { drawer.open = false }

    // Outside tap closes the drawer. No visual scrim: an alpha wash would
    // dither badly on e-ink and force a large repaint.
    MouseArea {
        anchors.fill: parent
        onClicked: drawer.dismiss()
    }

    Rectangle {
        id: panel
        width: 460
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.left: parent.left
        color: Ui.paper

        // Modal boundary — one of the few borders the language keeps.
        Rectangle {
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            anchors.right: parent.right
            width: 2
            color: Ui.ink100
        }

        MouseArea { anchors.fill: parent }   // eat taps inside the panel

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 0
            anchors.topMargin: 40
            anchors.bottomMargin: 40
            spacing: 0

            component DrawerRow: Item {
                id: row
                property string label: ""
                property int module: -1
                readonly property bool current: drawer.currentModule === module

                Layout.fillWidth: true
                Layout.preferredHeight: 96

                Rectangle {
                    anchors.fill: parent
                    color: Ui.ink100
                    visible: rowTap.pressed          // pressed = temporary reverse fill
                }
                Rectangle {
                    anchors.left: parent.left
                    anchors.verticalCenter: parent.verticalCenter
                    width: row.current ? 3 : 0
                    height: row.current ? 48 : 0
                    color: rowTap.pressed ? Ui.paper : Ui.ink100
                }
                Text {
                    anchors.left: parent.left
                    anchors.leftMargin: 44
                    anchors.verticalCenter: parent.verticalCenter
                    text: row.label
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.task
                    font.bold: row.current
                    color: rowTap.pressed ? Ui.paper
                         : row.current ? Ui.ink100
                         : Ui.ink70
                }
                MouseArea {
                    id: rowTap
                    anchors.fill: parent
                    onClicked: {
                        drawer.dismiss()
                        drawer.navigate(row.module)
                    }
                }
            }

            DrawerRow { objectName: "drawer.home";  label: "Home";  module: 0 }
            DrawerRow { objectName: "drawer.today"; label: "Today"; module: 1 }
            DrawerRow { objectName: "drawer.notes"; label: "Notes"; module: 2 }

            Rectangle {
                Layout.fillWidth: true
                Layout.leftMargin: 44
                Layout.rightMargin: 44
                Layout.topMargin: 20
                Layout.bottomMargin: 20
                height: 1
                color: Ui.ink30
            }

            DrawerRow { objectName: "drawer.inbox";  label: "Inbox";  module: 3 }
            DrawerRow { objectName: "drawer.review"; label: "Review"; module: 4 }
            DrawerRow { objectName: "drawer.system"; label: "System"; module: 5 }

            Item { Layout.fillHeight: true }

            Rectangle {
                Layout.fillWidth: true
                Layout.leftMargin: 44
                Layout.rightMargin: 44
                Layout.bottomMargin: 20
                height: 1
                color: Ui.ink30
            }

            Item {
                objectName: "drawer.exit"
                Layout.fillWidth: true
                Layout.preferredHeight: 88

                Rectangle {
                    anchors.fill: parent
                    color: Ui.ink100
                    visible: exitTap.pressed
                }
                Text {
                    anchors.left: parent.left
                    anchors.leftMargin: 44
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Return to reMarkable"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.button
                    color: exitTap.pressed ? Ui.paper : Ui.ink70
                }
                MouseArea {
                    id: exitTap
                    anchors.fill: parent
                    onClicked: Qt.quit()
                }
            }

            Text {
                Layout.leftMargin: 44
                text: "PaperOS · " + Ui.scale + " · " + deviceStatus.appVersion
                font.family: Ui.fontFamily
                font.pixelSize: Ui.footer
                color: Ui.ink30
            }
        }
    }
}
