import Testing
import KenosDesign

@Test("Design tokens expose spacing and a11y helpers")
@MainActor
func designTokensExist() {
    #expect(KenosSpacing.md == 16)
    #expect(KenosSpacing.lg == 24)
    _ = KenosA11y.reduceMotionPreferred
}
