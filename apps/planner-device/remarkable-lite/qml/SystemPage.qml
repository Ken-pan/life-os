import QtQuick
import QtQuick.Layouts

// System: user-facing settings. Raw errors/probes live in Diagnostics overlay.
Item {
    id: page

    property bool diagnosticsOpen: false
    property string frontlightSummary: "Not probed yet"

    // ── Main settings ──────────────────────────────────────────
    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        visible: !page.diagnosticsOpen

        Text {
            text: "System"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.primary
            font.bold: true
            color: Ui.ink
            Layout.bottomMargin: Ui.gap
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: Ui.divider }

        // ── Sync ───────────────────────────────────────────────
        Item {
            Layout.fillWidth: true
            height: 130

            RowLayout {
                anchors.fill: parent
                spacing: Ui.gap

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 6
                    Text {
                        text: "Sync"
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.task
                        font.bold: true
                        color: Ui.ink
                    }
                    Text {
                        text: apiClient.isLoading ? "syncing..."
                            : (apiClient.errorMessage !== "" ? "offline" : "synced " + apiClient.lastSync)
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.meta
                        color: Ui.muted
                    }
                    Text {
                        text: actionQueue.pendingCount + " pending actions"
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.meta
                        color: Ui.muted
                    }
                }
                PaperButton {
                    objectName: "system.sync"
                    label: apiClient.isLoading ? "Syncing..." : "Sync now"
                    enabled: !apiClient.isLoading
                    implicitHeight: Ui.btnHs
                    onTapped: apiClient.fetchDashboard()
                }
            }

            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Ui.divider }
        }

        // ── Display ────────────────────────────────────────────
        Item {
            Layout.fillWidth: true
            height: 130

            ColumnLayout {
                anchors.fill: parent
                spacing: 8

                Text {
                    text: "Display"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.task
                    font.bold: true
                    color: Ui.ink
                    Layout.topMargin: 12
                }
                RowLayout {
                    spacing: 12
                    Repeater {
                        model: ["clean", "balanced", "fast"]
                        delegate: PaperButton {
                            objectName: "system.refreshMode." + modelData
                            label: modelData.charAt(0).toUpperCase() + modelData.slice(1)
                            implicitHeight: Ui.btnHs
                            selected: refreshControl.mode === modelData
                            onTapped: refreshControl.mode = modelData
                        }
                    }
                    PaperButton {
                        objectName: "system.cleanScreen"
                        label: "Clean screen"
                        secondary: true
                        implicitHeight: Ui.btnHs
                        onTapped: refreshControl.requestClean()
                    }
                }
            }

            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Ui.divider }
        }

        // ── Device ─────────────────────────────────────────────
        Item {
            Layout.fillWidth: true
            height: 200

            ColumnLayout {
                anchors.fill: parent
                anchors.topMargin: 12
                spacing: 8

                Text {
                    text: "Device"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.task
                    font.bold: true
                    color: Ui.ink
                }
                StatusLine { label: "Battery"; value: deviceStatus.batteryPercent >= 0 ? deviceStatus.batteryPercent + "% " + deviceStatus.batteryState : "unknown" }
                StatusLine { label: "Storage"; value: deviceStatus.storageFreeGb.toFixed(1) + " GB free" }
                StatusLine { label: "Wi-Fi"; value: deviceStatus.wifiState }
                StatusLine { label: "Scale"; value: Ui.scale }
                StatusLine { label: "PaperOS"; value: deviceStatus.appVersion }
            }

            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Ui.divider }
        }

        Item { Layout.fillHeight: true }

        // ── Safety + Diagnostics ───────────────────────────────
        RowLayout {
            spacing: Ui.gap
            PaperButton {
                objectName: "system.returnRemarkable"
                label: "Return to reMarkable"
                implicitHeight: Ui.btnH
                onTapped: Qt.quit()
            }
            PaperButton {
                objectName: "system.diagnostics"
                label: "Diagnostics"
                secondary: true
                implicitHeight: Ui.btnH
                onTapped: page.diagnosticsOpen = true
            }
        }
    }

    // ── Diagnostics overlay ────────────────────────────────────
    Rectangle {
        anchors.fill: parent
        color: Ui.paper
        visible: page.diagnosticsOpen
        z: 100

        ColumnLayout {
            anchors.fill: parent
            spacing: 12

            RowLayout {
                Layout.fillWidth: true
                Text {
                    text: "Diagnostics"
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.primary
                    font.bold: true
                    color: Ui.ink
                }
                Item { Layout.fillWidth: true }
                PaperButton {
                    label: "Close"
                    secondary: true
                    implicitHeight: Ui.btnHs
                    onTapped: page.diagnosticsOpen = false
                }
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: Ui.divider }

            StatusLine { label: "API Error"; value: apiClient.errorMessage !== "" ? apiClient.errorMessage : "none" }
            StatusLine { label: "Marker"; value: penBridge.available ? "active — " + penBridge.calibrationInfo : penBridge.calibrationInfo }
            StatusLine { label: "Updates since clean"; value: String(refreshControl.updatesSinceClean) }
            StatusLine { label: "Clean threshold"; value: String(refreshControl.cleanThreshold) }

            Item { height: 12 }

            Text {
                text: "Frontlight Probe"
                font.family: Ui.fontFamily
                font.pixelSize: Ui.task
                font.bold: true
                color: Ui.ink
            }
            RowLayout {
                spacing: Ui.gap
                PaperButton {
                    label: "Run Probe"
                    implicitHeight: Ui.btnHs
                    onTapped: {
                        var probe = deviceStatus.frontlightProbe()
                        page.frontlightSummary = probe.available
                            ? probe.candidates.length + " candidate(s): " + probe.candidates[0].path
                            : "Frontlight control unavailable"
                    }
                }
                Text {
                    text: page.frontlightSummary
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.meta
                    color: Ui.muted
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
            }

            Item { Layout.fillHeight: true }
        }
    }
}
