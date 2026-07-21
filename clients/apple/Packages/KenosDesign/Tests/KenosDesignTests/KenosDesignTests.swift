import Testing
import KenosDesign
import SwiftUI

@Test("Design tokens expose spacing and a11y helpers")
@MainActor
func designTokensExist() {
    #expect(KenosSpacing.md == 16)
    #expect(KenosSpacing.lg == 24)
    _ = KenosA11y.reduceMotionPreferred
}

@Test("Motion SSOT keeps three families and reduce-motion short")
func motionTokensFeelSystemLike() {
    // Selection
    #expect(KenosMotion.selectionResponse >= 0.24)
    #expect(KenosMotion.selectionResponse <= 0.36)
    #expect(KenosMotion.selectionDamping >= 0.80)
    // Spatial (Shelf open / Mode / page)
    #expect(KenosMotion.spatialResponse == KenosMotion.shelfOpenResponse)
    #expect(KenosMotion.shelfOpenDamping >= 0.80)
    #expect(KenosMotion.shelfOpenDamping <= 0.92)
    #expect(KenosMotion.shelfCloseDamping >= KenosMotion.shelfOpenDamping)
    #expect(KenosMotion.shelfCloseResponse <= KenosMotion.shelfOpenResponse)
    // Chrome aliases Selection; page/shellMode alias Spatial family tokens
    #expect(KenosMotion.chromeResponse == KenosMotion.selectionResponse)
    #expect(KenosMotion.pageResponse == KenosMotion.spatialResponse)
    #expect(KenosMotion.shellModeResponse == KenosMotion.spatialResponse)
    #expect(KenosMotion.pageDamping >= KenosMotion.selectionDamping)
    #expect(KenosMotion.pageDamping >= KenosMotion.spatialDamping)
    #expect(KenosMotion.reduceMotionDuration <= 0.20)
    #expect(KenosMotion.pressScale >= 0.96)
    #expect(KenosMotion.orbPressScale > KenosMotion.pressScale)
    #expect(KenosMotion.orbPressScaleReduced >= KenosMotion.pressScaleReduced)
    _ = KenosMotion.selection(reduceMotion: true)
    _ = KenosMotion.spatial(reduceMotion: false)
    _ = KenosMotion.shelf(reduceMotion: false)
    _ = KenosMotion.shelfInteractive(reduceMotion: false)
    _ = KenosMotion.chrome(reduceMotion: false)
    _ = KenosMotion.shellMode(reduceMotion: false)
    _ = KenosMotion.page(reduceMotion: false)
    _ = KenosMotion.unveil(reduceMotion: true)
    _ = KenosMotion.shelfPanelTransition(reduceMotion: false)
    _ = KenosMotion.pageSettleTransition(reduceMotion: true)
    _ = KenosPressStyle(reduceMotion: true)
    #expect(KenosMotion.shellModeDamping >= KenosMotion.selectionDamping)
    #expect(KenosMotion.unveilDuration <= 0.40)
    #expect(KenosMotion.unveilReduceDuration <= KenosMotion.reduceMotionDuration)
    #expect(KenosMotion.softVeilInDuration < KenosMotion.softVeilOutDuration)
    #expect(KenosMotion.shelfBackdropScale(reduceMotion: true, progress: 1) == 1)
    #expect(KenosMotion.shelfBackdropOffset(reduceMotion: true, progress: 1) == 0)
    #expect(
        abs(KenosMotion.shelfBackdropScale(reduceMotion: false, progress: 1) - 0.97) < 0.001
    )
    #expect(KenosMotion.shelfBackdropOffset(reduceMotion: false, progress: 1) == 20)
    #expect(
        KenosMotion.shellSurfaceScale(reduceMotion: false, isForeground: true)
            == KenosMotion.shellIncomingScale
    )
    #expect(
        KenosMotion.shellSurfaceScale(reduceMotion: false, isForeground: false)
            == KenosMotion.shellOutgoingScale
    )
    #expect(KenosMotion.shellOutgoingScale <= 0.98)
    #expect(KenosMotion.shellOutgoingScale >= 0.97)
    #expect(
        KenosMotion.shellSurfaceScale(reduceMotion: true, isForeground: false) == 1
    )
    #expect(KenosMotion.orbPressScale(reduceMotion: false, pressed: true) == KenosMotion.orbPressScale)
    #expect(
        KenosMotion.orbPressScale(reduceMotion: true, pressed: true)
            == KenosMotion.orbPressScaleReduced
    )
}

@Test("Shelf panel width helper caps near 320")
func shelfPanelWidthHelper() {
    #expect(KenosShelfGesture.panelWidth == 320)
    #expect(KenosShelfGesture.preferredPanelWidth(containerWidth: 430) == 320)
    #expect(
        abs(KenosShelfGesture.preferredPanelWidth(containerWidth: 390) - 390 * 0.82) < 0.01
    )
    #expect(
        abs(KenosShelfGesture.preferredPanelWidth(containerWidth: 320) - 262.4) < 0.01
    )
    #expect(
        abs(KenosShelfGesture.openProgress(translationX: 160, panelWidth: 320) - 0.5) < 0.001
    )
}

@Test("Adaptive shelf dim responds to scheme and Reduce Transparency")
func adaptiveShelfDim() {
    let light = KenosMotion.adaptiveShelfDimOpacity(colorScheme: .light, reduceTransparency: false)
    let dark = KenosMotion.adaptiveShelfDimOpacity(colorScheme: .dark, reduceTransparency: false)
    let strong = KenosMotion.adaptiveShelfDimOpacity(colorScheme: .light, reduceTransparency: true)
    #expect(light > dark)
    #expect(strong > light)
    #expect(light >= 0.28 && light <= 0.52)
}
