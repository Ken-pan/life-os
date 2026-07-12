import QtQuick
import QtQuick.Layouts

// Settings (PAPR.UI.2 §2.6): user-facing settings and device status backed by
// current UI contracts. Return to reMarkable lives only in the Drawer footer
// (not duplicated here). No Sleep/Wake/Restart/Shutdown or other lifecycle
// controls belong on this page until their owning track delivers them.
// Raw errors/probes live in the Diagnostics overlay.
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
            text: "Settings"
            font.family: Ui.fontFamily
            font.pixelSize: Ui.primary
            font.bold: true
            color: Ui.ink100
            Layout.bottomMargin: Ui.gap
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: Ui.ink30 }

        // ── Sync ───────────────────────────────────────────────
        // Healthy sync is hidden (PAPR.UI.2 §2.1); only shown while
        // loading, on error, or with pending actions.
        Item {
            Layout.fillWidth: true
            height: 130
            visible: apiClient.isLoading || apiClient.errorMessage !== "" || actionQueue.pendingCount > 0

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
                        color: Ui.ink100
                    }
                    Text {
                        text: apiClient.isLoading ? "syncing..."
                            : (apiClient.errorMessage !== "" ? "offline" : "synced " + apiClient.lastSync)
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.meta
                        color: Ui.ink70
                    }
                    Text {
                        visible: actionQueue.pendingCount > 0
                        text: actionQueue.pendingCount + " pending actions"
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.meta
                        color: Ui.ink70
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

            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Ui.ink30 }
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
                    color: Ui.ink100
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

            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Ui.ink30 }
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
                    color: Ui.ink100
                }
                StatusLine { label: "Battery"; value: deviceStatus.batteryPercent >= 0 ? deviceStatus.batteryPercent + "% " + deviceStatus.batteryState : "unknown" }
                StatusLine { label: "Storage"; value: deviceStatus.storageFreeGb.toFixed(1) + " GB free" }
                StatusLine { label: "Wi-Fi"; value: deviceStatus.wifiState }
                StatusLine { label: "Scale"; value: Ui.scale }
                StatusLine { label: "PaperOS"; value: deviceStatus.appVersion }
            }

            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Ui.ink30 }
        }

        Item { Layout.fillHeight: true }

        // ── Diagnostics entry ──────────────────────────────────
        // Return to reMarkable is not duplicated here — its canonical
        // location is the Drawer footer (PAPR.UI.2 §2.6).
        RowLayout {
            spacing: Ui.gap
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
                    color: Ui.ink100
                }
                Item { Layout.fillWidth: true }
                PaperButton {
                    label: "Close"
                    secondary: true
                    implicitHeight: Ui.btnHs
                    onTapped: page.diagnosticsOpen = false
                }
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: Ui.ink30 }

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
                color: Ui.ink100
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
                    color: Ui.ink70
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
            }

            Item { Layout.fillHeight: true }
        }
    }
}
