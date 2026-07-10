import QtQuick

// One "label: value" row for status/settings panels.
Row {
    property string label: ""
    property string value: ""

    spacing: 16

    Text {
        text: label
        font.family: Ui.fontFamily
        font.pixelSize: Ui.meta
        color: Ui.muted
        width: 330
        elide: Text.ElideRight
    }
    Text {
        text: value
        font.family: Ui.fontFamily
        font.pixelSize: Ui.meta
        font.bold: true
        color: Ui.ink
    }
}
