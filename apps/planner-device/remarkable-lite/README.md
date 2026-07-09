# PlannerOS Lite - reMarkable Paper Pro (chiappa)

This is the device client skeleton for PlannerOS on the reMarkable Paper Pro (OS 5.7+ / scarthgap).

## SDK and Build Environment

The reMarkable Paper Pro (imx93-chiappa) utilizes Qt 6 and a Cortex-A55 architecture.

**Blocker / Environment Note for Apple Silicon:**
The official reMarkable toolchains are distributed as `x86_64` shell scripts that extract a Yocto cross-compilation environment. 
- **Apple Silicon (ARM64) Macs** cannot natively execute or use the `x86_64` toolchain directly in macOS.
- **Solution:** A Linux `x86_64` environment is required. This can be achieved via:
  1. A Docker container running with `--platform linux/amd64` (Rosetta 2 will emulate x86_64, but compilation will be slow).
  2. A remote Linux `x86_64` build server.
  3. An `x86_64` VM via UTM/Parallels.

Until the environment is provisioned with the official Qt6 SDK for `chiappa`, this app remains a skeleton.

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
scp planneros-lite remarkable-pro-move:/home/root/planneros-lite/
```
