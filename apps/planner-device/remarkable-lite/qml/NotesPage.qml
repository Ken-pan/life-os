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
                text: {
                    var pen = penBridge.available
                        ? (penBridge.eraserActive ? "eraser" : (penBridge.penInRange ? "pen ready" : "pen idle"))
                        : "pen off"
                    var base = page.activeNoteId === "" ? noteStore.noteCount + " notes saved" : page.activeNoteId + " · " + page.strokeCount + " strokes"
                    return base + " · " + pen
                }
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
                    pendingPoints = []
                    var ctx = getContext("2d")
                    ctx.clearRect(0, 0, width, height)
                    requestPaint()
                }

                // Paint batching: points accumulate and flush at ~25 fps —
                // per-point repaints drown the e-ink pipeline and the line
                // shows up seconds after the pen.
                Timer {
                    id: paintTimer
                    interval: 40
                    repeat: true
                    running: false
                    onTriggered: {
                        if (canvas.pendingPoints.length > 1)
                            canvas.requestPaint()
                    }
                }

                onPaint: {
                    var ctx = getContext("2d")
                    ctx.lineCap = "round"
                    ctx.lineJoin = "round"
                    var pts = pendingPoints
                    for (var i = 1; i < pts.length; i++) {
                        // Eraser paints wide card-color strokes; pen width
                        // follows pressure (finger has p=0 → base width).
                        ctx.strokeStyle = pts[i].e ? Ui.card : Ui.ink
                        ctx.lineWidth = pts[i].e ? 28 : (2 + pts[i].p * 4)
                        ctx.beginPath()
                        ctx.moveTo(pts[i - 1].x, pts[i - 1].y)
                        ctx.lineTo(pts[i].x, pts[i].y)
                        ctx.stroke()
                    }
                    if (pts.length > 0)
                        pendingPoints = [pts[pts.length - 1]]
                }
            }

            // Receives finger touches and pen contacts alike — the pen is
            // injected as mouse events by PenInputService; pressure and
            // eraser state are read imperatively from penBridge per point.
            MouseArea {
                anchors.fill: parent
                enabled: page.activeNoteId !== ""
                onPressed: (mouse) => {
                    var p = penBridge.penTouching ? penBridge.pressure : 0
                    var e = penBridge.eraserActive
                    page.currentStroke = [{ x: mouse.x, y: mouse.y, t: Date.now(), p: p, tool: e ? "eraser" : "pen" }]
                    canvas.pendingPoints = [{ x: mouse.x, y: mouse.y, p: p, e: e }]
                    paintTimer.start()
                }
                onPositionChanged: (mouse) => {
                    var p = penBridge.penTouching ? penBridge.pressure : 0
                    page.currentStroke.push({ x: mouse.x, y: mouse.y, t: Date.now(), p: p })
                    canvas.pendingPoints.push({ x: mouse.x, y: mouse.y, p: p, e: penBridge.eraserActive })
                }
                onReleased: {
                    paintTimer.stop()
                    canvas.requestPaint()
                    page.saveStroke()
                }
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
