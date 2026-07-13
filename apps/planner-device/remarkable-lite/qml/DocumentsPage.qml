import QtQuick
import QtQuick.Layouts

Item {
    id: page

    ColumnLayout {
        anchors.centerIn: parent
        spacing: 16

        Text {
            Layout.alignment: Qt.AlignHCenter
            text: "No documents yet"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.task
            font.bold: true
            color: Ui.ink100
        }

        Text {
            Layout.alignment: Qt.AlignHCenter
            text: "PDFs and EPUBs will appear here when connected."
            font.family: Ui.fontFamily
            font.pixelSize: Ui.meta
            color: Ui.ink70
        }
    }
}
