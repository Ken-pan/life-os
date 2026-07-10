import QtQuick

// One "label: value" row for status panels.
Row {
    property string label: ""
    property string value: ""

    spacing: 16

    Text {
        text: label
        font.family: Ui.fontFamily
        font.pixelSize: Ui.fontMeta
        color: Ui.mutedInk
        width: 330
        elide: Text.ElideRight
    }
    Text {
        text: value
        font.family: Ui.fontFamily
        font.pixelSize: Ui.fontMeta
        font.bold: true
        color: Ui.ink
    }
}
