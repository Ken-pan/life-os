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

@Test("Motion SSOT keeps selection snappy and reduce-motion short")
func motionTokensFeelSystemLike() {
    #expect(KenosMotion.selectionResponse >= 0.30)
    #expect(KenosMotion.selectionResponse <= 0.42)
    #expect(KenosMotion.selectionDamping >= 0.80)
    // Open spring is snappier (slightly lower damping); close is calmer.
    #expect(KenosMotion.shelfOpenDamping >= 0.80)
    #expect(KenosMotion.shelfOpenDamping <= 0.92)
    #expect(KenosMotion.shelfCloseDamping >= KenosMotion.shelfOpenDamping)
    #expect(KenosMotion.shelfCloseResponse <= KenosMotion.shelfOpenResponse)
    #expect(KenosMotion.chromeResponse >= 0.30)
    #expect(KenosMotion.chromeResponse <= 0.42)
    #expect(KenosMotion.chromeDamping >= 0.80)
    #expect(KenosMotion.pageResponse >= 0.30)
    #expect(KenosMotion.pageResponse <= 0.42)
    #expect(KenosMotion.pageDamping >= KenosMotion.selectionDamping)
    #expect(KenosMotion.reduceMotionDuration <= 0.20)
    _ = KenosMotion.selection(reduceMotion: true)
    _ = KenosMotion.shelf(reduceMotion: false)
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
        KenosMotion.shellSurfaceScale(reduceMotion: false, isForeground: true, isPresent: true)
            == KenosMotion.shellIncomingScale
    )
    #expect(
        KenosMotion.shellSurfaceScale(reduceMotion: false, isForeground: false, isPresent: true)
            == KenosMotion.shellOutgoingScale
    )
    #expect(
        KenosMotion.shellSurfaceScale(reduceMotion: true, isForeground: false, isPresent: false)
            == 1
    )
}
