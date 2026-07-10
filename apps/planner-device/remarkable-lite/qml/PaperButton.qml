import QtQuick

// Minimal e-ink button. Inverted when `selected`, dimmed when disabled.
// `secondary` renders a quiet variant (thin border, normal weight).
Rectangle {
    id: button

    property string label: ""
    property bool selected: false
    property bool secondary: false
    signal tapped()

    implicitWidth: labelText.implicitWidth + 48
    implicitHeight: Ui.btnH
    radius: 0
    color: selected ? Ui.ink : Ui.paper
    border.width: secondary ? 1 : 2
    border.color: !enabled ? Ui.muted : Ui.ink

    Text {
        id: labelText
        anchors.centerIn: parent
        text: button.label
        font.family: Ui.fontFamily
        font.pixelSize: Ui.button
        font.bold: !button.secondary
        color: button.selected ? Ui.paper
             : !button.enabled ? Ui.muted
             : Ui.ink
    }

    MouseArea {
        anchors.fill: parent
        enabled: button.enabled
        onClicked: button.tapped()
    }
}
