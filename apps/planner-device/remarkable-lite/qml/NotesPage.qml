import QtQuick
import QtQuick.Layouts

// Quick Note v0: capture raw ink to strokes JSONL. Recognition and export
// come later — ink first, like Newton: never lose the original strokes.
Item {
    id: page

    property string activeNoteId: ""
    property var currentStroke: []
    property int strokeCount: 0

    function startNote() {
        activeNoteId = noteStore.createNote("quick")
        strokeCount = 0
        canvas.clearAll()
    }

    function saveStroke() {
        if (currentStroke.length > 1 && activeNoteId !== "") {
            noteStore.appendStroke(activeNoteId, currentStroke)
            strokeCount += 1
        }
        currentStroke = []
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.gap

        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.gap

            PaperButton {
                label: page.activeNoteId === "" ? "New Quick Note" : "New Page"
                onTapped: page.startNote()
            }
            PaperButton {
                label: "Clear"
                enabled: page.activeNoteId !== ""
                onTapped: canvas.clearAll()
            }
            Item { Layout.fillWidth: true }
            Text {
                text: page.activeNoteId === "" ? noteStore.noteCount + " notes saved" : page.activeNoteId + " · " + page.strokeCount + " strokes"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontMeta
                color: Ui.mutedInk
            }
        }

        // INK SURFACE
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: Ui.card
            radius: Ui.radius
            border.width: 2
            border.color: Ui.line

            Text {
                anchors.centerIn: parent
                visible: page.activeNoteId === ""
                text: "Tap New Quick Note, then write here.\nStrokes are saved to data/notes/ as JSONL."
                horizontalAlignment: Text.AlignHCenter
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontBody
                color: Ui.faintInk
            }

            Canvas {
                id: canvas
                anchors.fill: parent
                anchors.margins: 4
                property var pendingPoints: []

                function clearAll() {
                    var ctx = getContext("2d")
                    ctx.clearRect(0, 0, width, height)
                    requestPaint()
                }

                onPaint: {
                    var ctx = getContext("2d")
                    ctx.strokeStyle = Ui.ink
                    ctx.lineWidth = 3
                    ctx.lineCap = "round"
                    if (pendingPoints.length > 1) {
                        ctx.beginPath()
                        ctx.moveTo(pendingPoints[0].x, pendingPoints[0].y)
                        for (var i = 1; i < pendingPoints.length; i++)
                            ctx.lineTo(pendingPoints[i].x, pendingPoints[i].y)
                        ctx.stroke()
                    }
                    if (pendingPoints.length > 0)
                        pendingPoints = [pendingPoints[pendingPoints.length - 1]]
                }
            }

            MouseArea {
                anchors.fill: parent
                enabled: page.activeNoteId !== ""
                onPressed: (mouse) => {
                    page.currentStroke = [{ x: mouse.x, y: mouse.y, t: Date.now() }]
                    canvas.pendingPoints = [{ x: mouse.x, y: mouse.y }]
                }
                onPositionChanged: (mouse) => {
                    page.currentStroke.push({ x: mouse.x, y: mouse.y, t: Date.now() })
                    canvas.pendingPoints.push({ x: mouse.x, y: mouse.y })
                    canvas.requestPaint()
                }
                onReleased: page.saveStroke()
            }
        }

        // INPUT PROBE
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.gap

            PaperButton {
                label: "Input Probe"
                fontSize: Ui.fontMeta
                implicitHeight: 52
                onTapped: {
                    var probe = noteStore.inputProbe()
                    var names = []
                    for (var i = 0; i < probe.devices.length; i++)
                        names.push(probe.devices[i].name)
                    probeResult.text = probe.devices.length + " input devices: " + names.join(" · ")
                }
            }
            Text {
                id: probeResult
                text: "Probe lists pen/touch hardware for the OCR roadmap."
                font.family: Ui.fontFamily
                font.pixelSize: Ui.fontMeta
                color: Ui.mutedInk
                elide: Text.ElideRight
                Layout.fillWidth: true
            }
        }
    }
}
