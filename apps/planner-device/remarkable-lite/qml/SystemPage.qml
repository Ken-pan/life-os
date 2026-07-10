import QtQuick
import QtQuick.Layouts

// System: sync state, display policy, device telemetry, and the safety
// exits. This page is why PaperOS feels like a system, not a demo.
Item {
    id: page

    property string frontlightSummary: "Not probed yet"

    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.gap

        // SYNC
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 200
            color: Ui.card
            radius: Ui.radius
            border.width: 1
            border.color: Ui.line

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: Ui.cardPadding
                spacing: 8
                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        text: "SYNC"
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.fontMeta
                        font.bold: true
                        color: Ui.accent
                    }
                    Item { Layout.fillWidth: true }
                    PaperButton {
                        label: apiClient.isLoading ? "Syncing..." : "Sync now"
                        fontSize: Ui.fontMeta
                        implicitHeight: 52
                        enabled: !apiClient.isLoading
                        onTapped: apiClient.fetchDashboard()
                    }
                }
                StatusLine { label: "Last sync"; value: apiClient.lastSync !== "" ? apiClient.lastSync : "never" }
                StatusLine { label: "State"; value: apiClient.isLoading ? "syncing" : (apiClient.errorMessage !== "" ? "offline/stale — " + apiClient.errorMessage : "fresh") }
                StatusLine { label: "Pending actions"; value: String(actionQueue.pendingCount) }
            }
        }

        // DISPLAY
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 250
            color: Ui.card
            radius: Ui.radius
            border.width: 1
            border.color: Ui.line

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: Ui.cardPadding
                spacing: 10
                Text {
                    text: "DISPLAY"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontMeta
                    font.bold: true
                    color: Ui.accent
                }
                RowLayout {
                    spacing: Ui.gap
                    Repeater {
                        model: ["clean", "balanced", "fast"]
                        delegate: PaperButton {
                            label: modelData.charAt(0).toUpperCase() + modelData.slice(1)
                            fontSize: Ui.fontMeta
                            selected: refreshControl.mode === modelData
                            onTapped: refreshControl.mode = modelData
                        }
                    }
                    PaperButton {
                        label: "Clean screen"
                        fontSize: Ui.fontMeta
                        onTapped: refreshControl.requestClean()
                    }
                }
                Text {
                    text: "Full repaint every " + refreshControl.cleanThreshold + " page updates · " + refreshControl.updatesSinceClean + " since last"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontMeta
                    color: Ui.mutedInk
                }
                RowLayout {
                    spacing: Ui.gap
                    PaperButton {
                        label: "Frontlight probe"
                        fontSize: Ui.fontMeta
                        implicitHeight: 52
                        onTapped: {
                            var probe = deviceStatus.frontlightProbe()
                            page.frontlightSummary = probe.available
                                ? probe.candidates.length + " candidate(s): " + probe.candidates[0].path
                                : "Frontlight control unavailable — use reMarkable Settings"
                        }
                    }
                    Text {
                        text: page.frontlightSummary
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.fontMeta
                        color: Ui.mutedInk
                        elide: Text.ElideRight
                        Layout.fillWidth: true
                    }
                }
            }
        }

        // DEVICE
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 190
            color: Ui.card
            radius: Ui.radius
            border.width: 1
            border.color: Ui.line

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: Ui.cardPadding
                spacing: 8
                Text {
                    text: "DEVICE"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontMeta
                    font.bold: true
                    color: Ui.accent
                }
                StatusLine { label: "Battery"; value: deviceStatus.batteryPercent >= 0 ? deviceStatus.batteryPercent + "% " + deviceStatus.batteryState : "unknown" }
                StatusLine { label: "Storage (/home)"; value: deviceStatus.storageFreeGb.toFixed(1) + " GB free of " + deviceStatus.storageTotalGb.toFixed(1) + " GB" }
                StatusLine { label: "Wi-Fi"; value: deviceStatus.wifiState }
                StatusLine { label: "PaperOS"; value: deviceStatus.appVersion }
            }
        }

        Item { Layout.fillHeight: true }

        // SAFETY
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 180
            color: "transparent"
            radius: Ui.radius
            border.width: 2
            border.color: Ui.accent

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: Ui.cardPadding
                spacing: 10
                Text {
                    text: "SAFETY"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontMeta
                    font.bold: true
                    color: Ui.accent
                }
                PaperButton {
                    label: "Return to reMarkable"
                    onTapped: Qt.quit()
                }
                Text {
                    text: "If PaperOS ever hangs: ssh in and run /home/root/paperos/recover-xochitl.sh"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.fontMeta
                    color: Ui.mutedInk
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
            }
        }
    }
}
