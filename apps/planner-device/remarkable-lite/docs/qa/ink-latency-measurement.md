# Native Ink Physical Latency Measurement

Software timestamps (e.g., `software input-to-update-request latency`) can measure the time from when the kernel sees an evdev event to when Qt issues an update request, but they **cannot** determine when pigment becomes physically visible on the e-ink panel due to hardware waveform timing.

To accurately measure true physical latency and compare against the `xochitl` baseline, use the high-speed camera test mode.

## Equipment Required
- The target reMarkable hardware device.
- A smartphone capable of 120fps or 240fps slow-motion video recording (e.g., iPhone Slow-Mo mode).

## Test Preparation
1. Deploy the `paperos-ink-live` candidate to the device.
2. Ensure the room is well lit to minimize camera shutter blur.
3. Open a fixed calibration page with a high-contrast pen contact area. The screen should contain a frame counter or an alternating small timing marker outside the writing region.

## Measurement Procedure
1. Start recording slow-motion video on the smartphone at 120fps or 240fps. Ensure the screen, the tip of the physical Marker, and the timing marker are in focus.
2. Perform a fast, continuous horizontal stroke across the screen.
3. Stop the recording.

## Calculation
1. Open the video in an editor that allows frame-by-frame scrubbing.
2. Find the exact frame where the physical pen tip makes initial contact with the glass (`Frame_Contact`).
3. Scrub forward to find the exact frame where the first black/gray pixel becomes visible at that contact point (`Frame_Visible`).
4. Calculate the frame delta: `Delta = Frame_Visible - Frame_Contact`
5. Calculate latency based on camera framerate:
   - For 120fps (8.33ms per frame): `Latency = Delta * 8.33 ms`
   - For 240fps (4.16ms per frame): `Latency = Delta * 4.16 ms`

## Reporting

When submitting metrics for a Native Ink Gold candidate, report the following:
- **Physical Latency Median**: (Calculate from multiple measurements)
- **Physical Latency P95**: (Calculate from multiple measurements)
- **Sample Count**: Number of strokes measured
- **Camera FPS**: 120 or 240
- **Measurement Uncertainty**: ± 1 frame duration (e.g. ±4.16ms)

Do not claim xochitl-equivalent latency without this physical measurement or a clearly labeled subjective comparison from the manual gate.
