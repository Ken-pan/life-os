import QtQuick

// Big-target e-ink button. Inverted when `selected`, dimmed when disabled.
Rectangle {
    id: button

    property string label: ""
    property bool selected: false
    property int fontSize: Ui.fontSection
    signal tapped()

    implicitWidth: labelText.implicitWidth + 48
    implicitHeight: 64
    radius: Ui.radius
    color: selected ? Ui.ink : Ui.card
    border.width: 2
    border.color: enabled ? Ui.ink : Ui.line

    Text {
        id: labelText
        anchors.centerIn: parent
        text: button.label
        font.family: Ui.fontFamily
        font.pixelSize: button.fontSize
        color: button.selected ? Ui.card : (button.enabled ? Ui.ink : Ui.faintInk)
    }

    MouseArea {
        anchors.fill: parent
        enabled: button.enabled
        onClicked: button.tapped()
    }
}
