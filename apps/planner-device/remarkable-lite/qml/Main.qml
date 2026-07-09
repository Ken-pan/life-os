import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Window {
    width: 1620
    height: 2160
    visible: true
    title: qsTr("PlannerOS Lite")
    
    // Paper Pro resolution is 1620x2160, 229 PPI, with color support
    color: "#FFFFFF"

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 100
        spacing: 50

        Text {
            text: "PlannerOS Lite"
            font.pixelSize: 80
            font.bold: true
            Layout.alignment: Qt.AlignHCenter
            color: "#000000"
        }

        Text {
            text: new Date().toLocaleDateString(Qt.locale(), "dddd, MMMM d, yyyy")
            font.pixelSize: 40
            Layout.alignment: Qt.AlignHCenter
            color: "#555555"
        }

        Rectangle {
            Layout.fillWidth: true
            height: 2
            color: "#DDDDDD"
        }

        Text {
            text: "Current Focus"
            font.pixelSize: 50
            font.bold: true
            color: "#000000"
            Layout.topMargin: 50
        }

        // 3 Task Rows
        Repeater {
            model: [
                "1. Complete PR-4A Hello App",
                "2. Review PlannerOS API",
                "3. Sync local changes"
            ]
            
            Rectangle {
                Layout.fillWidth: true
                height: 100
                color: "#F5F5F5"
                radius: 10
                
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.left: parent.left
                    anchors.leftMargin: 30
                    text: modelData
                    font.pixelSize: 40
                    color: index === 0 ? "#FF0000" : "#000000" // Use some color to test Paper Pro
                }
            }
        }

        Item {
            Layout.fillHeight: true // Spacer
        }

        Text {
            text: "Last sync: mock"
            font.pixelSize: 30
            Layout.alignment: Qt.AlignHCenter
            color: "#888888"
        }
    }
}
