# apps/planner-device/remarkable-lite/docker/README.md
# PaperOS - reMarkable Docker Build Environment

This directory contains the reproducible Docker environment required to cross-compile the PaperOS app for the reMarkable Paper Pro Move (`imx93-chiappa` / OS 5.7.x).

Since the official reMarkable Qt6 SDK toolchain is compiled strictly for `x86_64` Linux hosts, Apple Silicon (M-series) Macs cannot use it natively. This Dockerfile forces a `linux/amd64` platform. Docker Desktop can run `linux/amd64` containers via emulation / Rosetta-backed acceleration where supported to build the app transparently.

## Prerequisites

Due to licensing, the reMarkable SDK cannot be committed to this repository. You must manually provide the SDK installer script.

1. Obtain the Yocto toolchain installer for the Paper Pro (e.g., `oecore-x86_64-cortexa55-toolchain-5.7.126.sh`).
2. Place the `.sh` file directly into `apps/planner-device/remarkable-lite/docker/sdk-installer/`.
3. Do not rename the file, but ensure it ends in `.sh`.

## Building the App

From the repository root, run the build script:

```bash
cd apps/planner-device/remarkable-lite
./scripts/build-remarkable.sh
```

### What the script does:
1. Verifies the SDK installer is present.
2. Builds a `linux/amd64` Docker image (if not already built). The Dockerfile automatically executes the SDK installer during the image build to extract the toolchain to `/opt/poky/5.7.126`.
3. Runs the container, mounting the `remarkable-lite` directory.
4. Executes CMake and Make inside the container using the toolchain environment.
5. Outputs the final `paperos` binary to `apps/planner-device/remarkable-lite/build-docker/`.
