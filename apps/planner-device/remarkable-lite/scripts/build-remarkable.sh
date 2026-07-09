#!/bin/bash
set -e

# Ensure we are in the correct directory (apps/planner-device/remarkable-lite)
cd "$(dirname "$0")/.."

echo "=== PlannerOS Lite - reMarkable Paper Pro Build Script ==="

# 1. Verify SDK Installer exists
SDK_DIR="docker/sdk-installer"
SDK_INSTALLER=$(find "$SDK_DIR" -maxdepth 1 -name "*.sh" -print -quit)

if [ -z "$SDK_INSTALLER" ]; then
    echo "ERROR: Missing reMarkable SDK Installer."
    echo "Please download the official x86_64 SDK installer for the Paper Pro (chiappa)"
    echo "and place the .sh file in: apps/planner-device/remarkable-lite/docker/sdk-installer/"
    echo "See docker/README.md for more details."
    exit 1
fi

echo "Found SDK installer: $SDK_INSTALLER"

# Determine platform based on installer name
if [[ "$SDK_INSTALLER" == *"aarch64"* ]]; then
    echo "Detected aarch64 SDK installer. Using native linux/arm64 container."
    PLATFORM="linux/arm64"
else
    echo "Detected x86_64 SDK installer. Using emulated linux/amd64 container."
    PLATFORM="linux/amd64"
fi

# 2. Build the Docker Image
IMAGE_NAME="planneros-lite-builder"
echo "Building Docker image ($IMAGE_NAME) for platform $PLATFORM..."
docker build --platform=$PLATFORM -t "$IMAGE_NAME" -f docker/Dockerfile docker/

# 3. Run the Build Container
echo "Starting build process in isolated container..."
# Mount the current directory to /workspace in the container
# The entrypoint.sh inside the container will run cmake & make and output to build-docker/
docker run --rm --platform=$PLATFORM \
    -v "$(pwd):/workspace" \
    "$IMAGE_NAME"

echo "=== Build Process Finished ==="
if [ -f "build-docker/planneros-lite" ]; then
    echo "SUCCESS! Binary located at: build-docker/planneros-lite"
    echo "You can now SCP this binary to the device safe workspace."
else
    echo "WARNING: Binary not found. Check build logs for errors."
fi
