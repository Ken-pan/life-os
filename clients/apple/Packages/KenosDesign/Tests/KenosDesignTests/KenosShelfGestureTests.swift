import Testing
import CoreGraphics
import KenosDesign

@Test("Shelf open progress tracks 1:1 then rubber-bands")
func shelfOpenProgressFeelsFingerLocked() {
    #expect(KenosShelfGesture.openProgress(translationX: 0) == 0)
    #expect(
        abs(KenosShelfGesture.openProgress(translationX: KenosShelfGesture.panelWidth) - 1) < 0.001
    )
    #expect(KenosShelfGesture.openProgress(translationX: KenosShelfGesture.panelWidth / 2) == 0.5)
    #expect(KenosShelfGesture.openProgress(translationX: -40) == 0)

    let overshot = KenosShelfGesture.openProgress(
        translationX: KenosShelfGesture.panelWidth + 80
    )
    #expect(overshot > 1)
    #expect(overshot < 1.3)
}

@Test("Shelf dismiss progress shrinks with leftward drag")
func shelfDismissProgressTracksClose() {
    #expect(KenosShelfGesture.dismissProgress(dismissOffsetX: 0) == 1)
    #expect(
        abs(
            KenosShelfGesture.dismissProgress(dismissOffsetX: -KenosShelfGesture.panelWidth) - 0
        ) < 0.001
    )
    #expect(
        abs(KenosShelfGesture.dismissProgress(dismissOffsetX: -KenosShelfGesture.panelWidth / 2) - 0.5)
            < 0.001
    )
}

@Test("Shelf commit uses distance or velocity")
func shelfCommitThresholds() {
    #expect(
        KenosShelfGesture.shouldCommitOpen(
            translationX: KenosShelfGesture.openDistance + 1,
            velocityX: 0
        )
    )
    #expect(
        KenosShelfGesture.shouldCommitOpen(
            translationX: 20,
            velocityX: KenosShelfGesture.openVelocity + 10
        )
    )
    #expect(
        !KenosShelfGesture.shouldCommitOpen(translationX: 12, velocityX: 40)
    )

    #expect(
        KenosShelfGesture.shouldCommitClose(
            translationX: -(KenosShelfGesture.closeDistance + 1),
            velocityX: 0
        )
    )
    #expect(
        KenosShelfGesture.shouldCommitClose(
            translationX: -20,
            velocityX: -(KenosShelfGesture.closeVelocity + 10)
        )
    )
    #expect(
        !KenosShelfGesture.shouldCommitClose(translationX: -20, velocityX: -40)
    )
}

@Test("Shelf rubber band and caps stay bounded")
func shelfRubberBandAndCaps() {
    #expect(KenosShelfGesture.rubberBand(0, limit: 36) == 0)
    let banded = KenosShelfGesture.rubberBand(80, limit: 36)
    #expect(banded > 0)
    #expect(banded < 80)
    #expect(banded <= 36)

    #expect(KenosShelfGesture.cappedDismissOffset(40) == 0)
    #expect(
        KenosShelfGesture.cappedDismissOffset(-400) == -KenosShelfGesture.panelWidth
    )
    #expect(
        KenosShelfGesture.cappedOpenTranslation(KenosShelfGesture.panelWidth + 200)
            > KenosShelfGesture.panelWidth
    )
}

@Test("Shelf edge-open zone stays dock-adjacent and leaves mid-screen for Back")
func shelfEdgeOpenZoneIsDockAdjacent() {
    let size = CGSize(width: 390, height: 844)
    let safeBottom: CGFloat = 34
    let clearance = KenosShelfGesture.edgeOpenBottomClearance(safeAreaBottom: safeBottom)
    let reach = KenosShelfGesture.edgeOpenReachHeight(
        containerHeight: size.height,
        clearance: clearance
    )

    #expect(KenosShelfGesture.edgeStripWidth > 0)
    #expect(KenosShelfGesture.edgeStripWidth <= 32)
    #expect(reach >= KenosShelfGesture.edgeOpenReachMin)
    #expect(reach <= KenosShelfGesture.edgeOpenReachMax)
    // Dock + home indicator stay outside the claim so Spaces tip remains tappable.
    #expect(clearance >= safeBottom + KenosGlass.dockRowHeight)

    let bandBottom = size.height - clearance
    let bandTop = bandBottom - reach
    let inBand = CGPoint(x: 12, y: (bandTop + bandBottom) / 2)
    let midScreen = CGPoint(x: 12, y: size.height * 0.45)
    let upperEdge = CGPoint(x: 12, y: 80)
    let dockTip = CGPoint(x: 12, y: size.height - safeBottom - 20)
    let outsideStrip = CGPoint(x: 80, y: inBand.y)

    #expect(
        KenosShelfGesture.isInEdgeOpenZone(
            point: inBand,
            containerSize: size,
            safeAreaBottom: safeBottom
        )
    )
    #expect(
        !KenosShelfGesture.isInEdgeOpenZone(
            point: midScreen,
            containerSize: size,
            safeAreaBottom: safeBottom
        )
    )
    #expect(
        !KenosShelfGesture.isInEdgeOpenZone(
            point: upperEdge,
            containerSize: size,
            safeAreaBottom: safeBottom
        )
    )
    #expect(
        !KenosShelfGesture.isInEdgeOpenZone(
            point: dockTip,
            containerSize: size,
            safeAreaBottom: safeBottom
        )
    )
    #expect(
        !KenosShelfGesture.isInEdgeOpenZone(
            point: outsideStrip,
            containerSize: size,
            safeAreaBottom: safeBottom
        )
    )
}

@Test("Shelf edge-open reach shrinks on short landscape containers")
func shelfEdgeOpenReachShrinksInLandscape() {
    let clearance = KenosShelfGesture.edgeOpenBottomClearance(safeAreaBottom: 21)
    let reach = KenosShelfGesture.edgeOpenReachHeight(
        containerHeight: 390,
        clearance: clearance
    )
    #expect(reach <= KenosShelfGesture.edgeOpenReachIdeal)
    #expect(reach <= (390 - clearance) * KenosShelfGesture.edgeOpenReachMaxFraction + 0.5)
}

@Test("Shelf threshold crossing helpers fire once")
func shelfThresholdCrossing() {
    #expect(
        KenosShelfGesture.crossedOpenThreshold(
            previousTranslation: KenosShelfGesture.openDistance - 1,
            currentTranslation: KenosShelfGesture.openDistance
        )
    )
    #expect(
        !KenosShelfGesture.crossedOpenThreshold(
            previousTranslation: KenosShelfGesture.openDistance + 1,
            currentTranslation: KenosShelfGesture.openDistance + 10
        )
    )
    #expect(
        KenosShelfGesture.crossedCloseThreshold(
            previousOffset: -(KenosShelfGesture.closeDistance - 1),
            currentOffset: -KenosShelfGesture.closeDistance
        )
    )
}
