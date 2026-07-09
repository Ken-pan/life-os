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
  - **Docker with Rosetta 2:** Running a `linux/amd64` Docker container. Docker Desktop can run `linux/amd64` containers via emulation / Rosetta-backed acceleration where supported. Performance overhead is notable but it provides the most reproducible, scriptable, and contained environment without external dependencies.
  - **UTM / Parallels VM:** Emulating an x86_64 Ubuntu VM. Performance is very slow compared to native or Rosetta translation.
  - **Remote Build Server:** A native x86_64 Linux machine (GitHub Actions, EC2, etc.). Extremely fast but requires external infrastructure.

## 3. Chosen Build Route: Docker Container (Multi-Architecture)

We have chosen **Option B: Docker container**.

**Reasoning:**
- **Reproducibility:** A Dockerfile guarantees the exact same environment dependencies (CMake, Make, Qt deps) for any developer.
- **Ease for User:** Minimal setup. The user only needs to drop the SDK installer into a specific directory and run a single build script. No manual VM provisioning.
- **Native Performance for Apple Silicon:** With the newly available `aarch64` host toolchain, Apple Silicon Macs can run a `linux/arm64` container natively, resulting in extremely fast builds.
- **x86_64 Fallback:** The build script falls back to `linux/amd64` using Docker Desktop's Rosetta 2 emulation if an older `x86_64` SDK installer is provided.

## 4. Prerequisite for Building

To actually compile the binary, the developer must obtain the official SDK installer script from reMarkable and place it in the `apps/planner-device/remarkable-lite/docker/sdk-installer` directory before running the build script.
