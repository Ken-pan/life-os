import QtQuick

// Big-target e-ink button. Inverted when `selected`, dimmed when disabled.
// `secondary` renders a quiet variant for actions that must not compete
// with the primary path (e.g. Defer next to the checkbox).
Rectangle {
    id: button

    property string label: ""
    property bool selected: false
    property bool secondary: false
    property int fontSize: Ui.fontSection
    signal tapped()

    implicitWidth: labelText.implicitWidth + 56
    implicitHeight: Ui.buttonHeight
    radius: Ui.radius
    color: selected ? Ui.ink : Ui.card
    border.width: secondary ? 1 : 2
    border.color: !enabled ? Ui.line : (secondary ? Ui.line : Ui.ink)

    Text {
        id: labelText
        anchors.centerIn: parent
        text: button.label
        font.family: Ui.fontFamily
        font.pixelSize: button.fontSize
        font.bold: !button.secondary
        color: button.selected ? Ui.card
             : !button.enabled ? Ui.faintInk
             : button.secondary ? Ui.mutedInk : Ui.ink
    }

    MouseArea {
        anchors.fill: parent
        enabled: button.enabled
        onClicked: button.tapped()
    }
}
