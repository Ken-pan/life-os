# PR-4A.5: reMarkable Pro Move Build Environment - SDK Verification

## 1. SDK Requirements and Specifications

- **Device:** reMarkable Paper Pro (Code name: `chiappa` / `imx93`)
- **OS Version:** 5.7.126 (Yocto release: `scarthgap`)
- **Target Architecture:** Cortex-A55 (ARM64)
- **UI Framework:** Qt 6 with custom `epaper` platform backend.
- **SDK Format:** The official Yocto toolchain installer is distributed as a self-extracting shell script designed for `x86_64` Linux hosts (e.g., `oecore-x86_64-cortexa55-toolchain-5.7.126.sh`).

## 2. Host OS & Architecture Compatibility

- **Supported Host:** Linux `x86_64` (Ubuntu 22.04 LTS or newer is recommended).
- **Apple Silicon (M1/M2/M3) Compatibility:** **Unsupported directly.** The SDK binaries and pre-compiled cross-compilers (`aarch64-oe-linux-gcc`) are strictly compiled for `x86_64` host machines. macOS cannot execute these directly.
- **Workarounds for Apple Silicon:**
  - **Docker with Rosetta 2:** Running a `linux/amd64` Docker container. Docker Desktop leverages Rosetta 2 to emulate x86_64 on ARM64 Macs. Performance overhead is notable but it provides the most reproducible, scriptable, and contained environment without external dependencies.
  - **UTM / Parallels VM:** Emulating an x86_64 Ubuntu VM. Performance is very slow compared to native or Rosetta translation.
  - **Remote Build Server:** A native x86_64 Linux machine (GitHub Actions, EC2, etc.). Extremely fast but requires external infrastructure.

## 3. Chosen Build Route: Docker `linux/amd64` (Option B)

We have chosen **Option B: Docker `linux/amd64` container**.

**Reasoning:**
- **Reproducibility:** A Dockerfile guarantees the exact same environment dependencies (CMake, Make, Qt deps) for any developer.
- **Ease for User:** Minimal setup. The user only needs to drop the SDK installer into a specific directory and run a single build script. No manual VM provisioning.
- **No Device Risk:** Compilation happens entirely locally in isolation.
- **Performance:** While Rosetta 2 x86 emulation on macOS is slower than native, compiling a small Qt6 skeleton app takes seconds, making the overhead acceptable for this stage.

## 4. Prerequisite for Building

To actually compile the binary, the developer must obtain the official SDK installer script from reMarkable and place it in the `apps/planner-device/remarkable-lite/docker/sdk-installer` directory before running the build script.
