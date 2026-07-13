import QtQuick
import QtQuick.Layouts

// DocumentsPage — the canonical Documents destination (PAPR.UI.2 §2.5).
// The current build has no document read model (no PDFs/imported files data
// source exists anywhere in ApiClient/NoteStore). This is a genuine capability
// gap, not an empty collection — "no documents" would claim a source that can
// enumerate zero; this page has no such source. Show the truthful capability
// state only. No list, no primary action, no fabricated content.
Item {
    id: page

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        Item { Layout.fillHeight: true }

        Text {
            objectName: "documents.unavailable"
            Layout.alignment: Qt.AlignHCenter
            Layout.fillWidth: true
            horizontalAlignment: Text.AlignHCenter
            text: "Documents are not available in this build"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.task
            color: Ui.ink70
            wrapMode: Text.WordWrap
        }

        Item { Layout.fillHeight: true }
    }
}
