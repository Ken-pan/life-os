# Paper Pro Move Direct Instant-Ink Probe Phase 2A Gate

## Step 1 - Paper Pro Move ABI / Device Audit

### Device Identification
- **Kernel/OS**: Linux imx93-chiappa 6.12.49 aarch64, Codex Linux 5.7.126 (scarthgap)
- **Machine**: reMarkable Chiappa
- **Family**: Freescale i.MX
- **SOC**: i.MX93

### Vendor Library: `libqsgepaper.so`
- **Path**: `/usr/lib/plugins/scenegraph/libqsgepaper.so`
- **Hash**: `0fadcef12749dd2bfd6b95c18abd36374243baef2a1321d7c81797af12af0261`
- **ABI Findings**:
  - `EPFramebuffer::createControlledInstance()`: **NOT FOUND**
  - `getAuxFramebuffer()`: **NOT FOUND**
  - `EPFramebuffer::instance()`: **FOUND**
  - `EPFramebuffer::setBuffers(std::tuple<QImage, QImage>, QImage*)`: **FOUND**
  - `EPFramebuffer::swapBuffers(QRect, EPContentType, EPScreenMode, QFlags<EPFramebuffer::UpdateFlag>)`: **FOUND**

### Input Devices
- **Marker**: `/dev/input/event2` (Elan marker input)
  - `ABS_X`: 0 - 6760 (Resolution 2208)
  - `ABS_Y`: 0 - 11960 (Resolution 1248)
  - `ABS_PRESSURE`: 0 - 4096
  - `ABS_TILT_X`: -9000 - 9000
  - `ABS_TILT_Y`: -9000 - 9000
  - `BTN_TOUCH`, `BTN_STYLUS`, `BTN_TOOL_PEN`, `BTN_TOOL_RUBBER`

### Existing Framebuffer Data
*To be filled out during runtime probe initialization*
- width:
- height:
- QImage format:
- bytesPerLine:
- depth:
- devicePixelRatio:
- aux framebuffer pointer alignment:

---

*(More sections will be filled out after the probe execution)*

### Existing Framebuffer Data
- **width**: 960 (Padded from 954)
- **height**: 1696
- **QImage format**: `QImage::Format_RGB32` (4) and `QImage::Format_Grayscale8` (24)
- **bytesPerLine**: 3840 (for RGB32) and 960 (for Grayscale8)
- **devicePixelRatio**: Likely 1.0 (based on resolution)
- **aux framebuffer pointer alignment**: Aligned to page boundary (0xffff885a3010, 0xffff900a2010)

## Step 2 - Probe Isolation
The wrapper successfully pauses `xochitl`, unlocks the framebuffer (`/tmp/epframebuffer.lock`), allocates its own instance of `EPFramebuffer`, intercepts `QImage` allocations, and cleanly shuts down, restoring `xochitl`.
