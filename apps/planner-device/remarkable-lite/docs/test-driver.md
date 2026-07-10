# PaperOS Test Driver

`paperctl` is a small host-side controller for debug PaperOS builds. It talks
to a local-only PaperOS test bridge through SSH port forwarding.

The bridge is disabled by default. Start a debug shell with:

```bash
apps/planner-device/remarkable-lite/scripts/paperctl start
```

Then use:

```bash
apps/planner-device/remarkable-lite/scripts/paperctl ping
apps/planner-device/remarkable-lite/scripts/paperctl state
apps/planner-device/remarkable-lite/scripts/paperctl tree
apps/planner-device/remarkable-lite/scripts/paperctl tap nav.today
apps/planner-device/remarkable-lite/scripts/paperctl wait page=today
apps/planner-device/remarkable-lite/scripts/paperctl screenshot artifacts/paperos.png
apps/planner-device/remarkable-lite/scripts/paperctl logs
apps/planner-device/remarkable-lite/scripts/paperctl ink-exit
```

For the normal build/deploy/check loop:

```bash
apps/planner-device/remarkable-lite/scripts/build-remarkable.sh
apps/planner-device/remarkable-lite/scripts/paperctl deploy shell --promote-shell --restart
apps/planner-device/remarkable-lite/scripts/paperctl doctor
```

`doctor` makes one SSH preflight, reports the active display service and
deployed shell hash, then probes the local-only bridge when it is enabled. Its
bridge line includes the current page plus native-ink note/tool/color state.
`ink-exit` safely saves and leaves a native note from the development computer,
which is useful after automated entry/screenshot checks.

The bridge exposes semantic `objectName` IDs such as:

```text
nav.home
nav.today
nav.write
nav.more
page.today
notes.new
notes.canvas
task.checkbox.<task-id>
```

When native ink is active, `paperctl screenshot` reads the resolved vendor
framebuffer instead of Qt's covered shell window. This makes toolbar and page
inspection possible from the development computer; pen feel and physical
color development still require validation on the Move panel.
