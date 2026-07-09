# PaperOS - reMarkable Paper Pro Move

This is the Qt/QML device client for PaperOS on the reMarkable Paper Pro Move
(`imx93-chiappa`, OS 5.7+ / scarthgap). Planner is the first provider for
PaperOS data.

The app is intentionally session-based for this phase:

```text
xochitl -> /home/root/paperos/open-paperos.sh -> PaperOS foreground app
        -> /home/root/paperos/recover-xochitl.sh
```

It does not patch xochitl, install boot services, or write to stock document
storage.

## Runtime Contract

On device, the app reads:

```text
/home/root/paperos/config.json
/home/root/paperos/token
/home/root/paperos/cache.json
/home/root/paperos/last_sync.txt
```

`config.json` should point at `https://planner.kenos.space`, use `mode: "real"`,
and reference the token/cache files. The token is never checked into the repo.

At startup the app loads the last-good `cache.json`, then attempts a fresh
`/api/paper/today` fetch. A successful fetch rewrites the cache and updates
`last_sync.txt`; a failed fetch leaves the cached dashboard visible and reports
the local error.

## SDK and Build Environment

The reMarkable Paper Pro (imx93-chiappa) utilizes Qt 6 and a Cortex-A55 architecture.

**Blocker / Environment Note for Apple Silicon:**
The official reMarkable toolchains are distributed as `x86_64` shell scripts that extract a Yocto cross-compilation environment. 
- **Apple Silicon (ARM64) Macs** cannot natively execute or use the `x86_64` toolchain directly in macOS.
- **Solution:** A Linux `x86_64` environment is required. This can be achieved via:
  1. A Docker container running with `--platform linux/amd64` (Rosetta 2 will emulate x86_64, but compilation will be slow).
  2. A remote Linux `x86_64` build server.
  3. An `x86_64` VM via UTM/Parallels.

Until the environment is provisioned with the official Qt6 SDK for `chiappa`,
this source can be reviewed and packaged, but not cross-compiled locally on
Apple Silicon without the SDK container described below.

## Building (Once SDK is installed in x86_64 Linux)

```bash
# Source the toolchain environment
source /opt/poky/5.7.126/environment-setup-cortexa55-imx93-chiappa-remarkable-linux

# Configure with CMake
mkdir build && cd build
cmake ..

# Build
make
```

## Deployment

Deploy the binary to the safe workspace on the device:

```bash
scp build-docker/paperos remarkable-pro-move:/home/root/paperos/paperos
ssh remarkable-pro-move 'chmod 755 /home/root/paperos/paperos'
```

Use the launcher/recovery scripts from `apps/planner/paper-device` for the
session wrapper.
