import QtQuick

// One "label: value" row for status panels.
Row {
    property string label: ""
    property string value: ""

    spacing: 12

    Text {
        text: label
        font.family: Ui.fontFamily
        font.pixelSize: Ui.fontMeta
        color: Ui.mutedInk
        width: 260
        elide: Text.ElideRight
    }
    Text {
        text: value
        font.family: Ui.fontFamily
        font.pixelSize: Ui.fontMeta
        color: Ui.ink
    }
}
