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

    Component.onCompleted: {
        apiClient.fetchDashboard()
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 100
        spacing: 50

        // FIXED HEADER
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 30

            Text {
                text: "PlannerOS Lite"
                font.pixelSize: 80
                font.bold: true
                Layout.alignment: Qt.AlignHCenter
                color: "#000000"
            }

            Text {
                text: apiClient.dashboardData.today ? apiClient.dashboardData.today.date : new Date().toLocaleDateString(Qt.locale(), "dddd, MMMM d, yyyy")
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
                text: apiClient.dashboardData.today && apiClient.dashboardData.today.currentFocus ? "Focus: " + apiClient.dashboardData.today.currentFocus.title : "Current Focus"
                font.pixelSize: 50
                font.bold: true
                color: "#000000"
                Layout.topMargin: 20
            }

            Text {
                visible: apiClient.errorMessage !== ""
                text: "Offline / unable to sync: " + apiClient.errorMessage
                font.pixelSize: 35
                color: "#FF0000"
                Layout.alignment: Qt.AlignHCenter
            }
        }

        // SCROLLABLE TASK LIST
        ListView {
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            spacing: 20
            interactive: true // allows touch scrolling/flicking
            boundsBehavior: Flickable.StopAtBounds // e-ink friendly, prevents overscroll bounce

            model: apiClient.dashboardData.tasks ? apiClient.dashboardData.tasks : [
                { title: "1. Complete PR-4A Hello App (Fallback)", isCompleted: false },
                { title: "2. Review PlannerOS API (Fallback)", isCompleted: false },
                { title: "3. Sync local changes (Fallback)", isCompleted: false }
            ]
            
            delegate: Rectangle {
                width: ListView.view.width
                height: 100
                color: "#F5F5F5"
                radius: 10
                
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.left: parent.left
                    anchors.leftMargin: 30
                    text: modelData.title !== undefined ? modelData.title : modelData
                    font.pixelSize: 40
                    color: index === 0 ? "#FF0000" : "#000000"
                }
            }

            ScrollBar.vertical: ScrollBar {
                active: true
                policy: ScrollBar.AlwaysOn
                width: 20
            }
        }

        // FIXED FOOTER
        Text {
            text: apiClient.isLoading ? "Syncing..." : ("Last sync: " + new Date().toLocaleTimeString())
            font.pixelSize: 30
            Layout.alignment: Qt.AlignHCenter
            color: "#888888"
        }
    }
}
