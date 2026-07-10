import QtQuick
import QtQuick.Layouts
import PaperOS 1.0

// Quick Note with a full tool system: ballpoint / fineliner / marker /
// pencil / eraser, color palette (the Move has a color panel), S/M/L
// widths, undo/redo. The pen draws through the C++ fast path; fingers
// navigate but do not draw — free palm rejection.
// Stroke counts, note ids and pen probes live in System > Diagnostics,
// not here: this page is the paper.
Item {
    id: page

    property string activeNoteId: ""
    property bool confirmingClear: false

    function startNote() {
        activeNoteId = noteStore.createNote("quick")
        inkItem.clear()
    }

    function persist() {
        if (activeNoteId !== "")
            noteStore.saveStrokes(activeNoteId, inkItem.allStrokes())
    }

    Timer {
        id: clearConfirmTimer
        interval: 3000
        onTriggered: page.confirmingClear = false
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 12

        // ROW 1: session controls
        RowLayout {
            Layout.fillWidth: true
            spacing: 12

            PaperButton {
                label: page.activeNoteId === "" ? "New Note" : "New Page"
                fontSize: Ui.fontMeta
                implicitHeight: Ui.buttonHeightSmall
                onTapped: page.startNote()
            }
            PaperButton {
                label: "Undo"
                fontSize: Ui.fontMeta
                implicitHeight: Ui.buttonHeightSmall
                enabled: inkItem.canUndo
                onTapped: inkItem.undo()
            }
            PaperButton {
                label: "Redo"
                fontSize: Ui.fontMeta
                implicitHeight: Ui.buttonHeightSmall
                enabled: inkItem.canRedo
                onTapped: inkItem.redo()
            }

            Item { Layout.fillWidth: true }

            // Clear is destructive: first tap arms it, second tap within 3s
            // wipes the page. Anything else lets the timer disarm it.
            PaperButton {
                label: page.confirmingClear ? "Clear page?" : "Clear"
                fontSize: Ui.fontMeta
                secondary: !page.confirmingClear
                selected: page.confirmingClear
                implicitHeight: Ui.buttonHeightSmall
                enabled: page.activeNoteId !== "" && inkItem.strokeCount > 0
                onTapped: {
                    if (page.confirmingClear) {
                        page.confirmingClear = false
                        clearConfirmTimer.stop()
                        inkItem.clear()
                    } else {
                        page.confirmingClear = true
                        clearConfirmTimer.restart()
                    }
                }
            }
        }

        // ROW 2: tools + width
        RowLayout {
            Layout.fillWidth: true
            spacing: 10

            Repeater {
                model: [["ballpoint", "Ball"], ["fineliner", "Fine"], ["marker", "Mark"], ["pencil", "Pencil"], ["eraser", "Erase"]]
                delegate: PaperButton {
                    label: modelData[1]
                    fontSize: Ui.fontMeta
                    implicitHeight: Ui.buttonHeightSmall
                    selected: inkItem.tool === modelData[0]
                    onTapped: inkItem.tool = modelData[0]
                }
            }

            Item { Layout.fillWidth: true }

            Repeater {
                model: [["S", 2.0], ["M", 3.2], ["L", 5.2]]
                delegate: PaperButton {
                    label: modelData[0]
                    fontSize: Ui.fontMeta
                    implicitHeight: Ui.buttonHeightSmall
                    implicitWidth: Ui.buttonHeightSmall
                    selected: Math.abs(inkItem.baseWidth - modelData[1]) < 0.1
                    onTapped: inkItem.baseWidth = modelData[1]
                }
            }
        }

        // ROW 3: color palette (Move renders color)
        RowLayout {
            Layout.fillWidth: true
            spacing: 14

            Repeater {
                model: ["#171717", "#9E9E9E", "#C03434", "#2456A4", "#2E7D4F", "#C7A500"]
                delegate: Rectangle {
                    width: 64
                    height: 64
                    radius: 32
                    color: modelData
                    border.width: Qt.colorEqual(inkItem.strokeColor, modelData) ? 6 : 1
                    border.color: Qt.colorEqual(inkItem.strokeColor, modelData) ? Ui.accent : Ui.line

                    MouseArea {
                        anchors.fill: parent
                        onClicked: inkItem.strokeColor = modelData
                    }
                }
            }

            Item { Layout.fillWidth: true }
        }

        // INK SURFACE — plain white paper, hairline frame
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: Ui.card
            radius: 4
            border.width: 1
            border.color: Ui.line

            Text {
                anchors.centerIn: parent
                visible: page.activeNoteId === ""
                text: "Tap New Note, then write with the Marker."
                horizontalAlignment: Text.AlignHCenter
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontBody
                color: Ui.faintInk
            }

            InkCanvasItem {
                id: inkItem
                anchors.fill: parent
                anchors.margins: 4
                captureEnabled: page.activeNoteId !== ""

                Component.onCompleted: penBridge.setInkTarget(inkItem)

                // strokesChanged only fires on committed changes (pen up,
                // undo, redo, clear) — never mid-stroke, so persisting here
                // is safe and covers every path. No refresh-flash while
                // writing: deghosting stays manual via Clean screen.
                onStrokesChanged: page.persist()
            }
        }
    }
}
