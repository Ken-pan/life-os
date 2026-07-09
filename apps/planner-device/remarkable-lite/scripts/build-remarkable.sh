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

# 2. Build the Docker Image
IMAGE_NAME="planneros-lite-builder"
echo "Building Docker image ($IMAGE_NAME) for platform linux/amd64..."
# Using --platform=linux/amd64 ensures it runs x86_64 on Apple Silicon via Rosetta
docker build --platform=linux/amd64 -t "$IMAGE_NAME" -f docker/Dockerfile docker/

# 3. Run the Build Container
echo "Starting build process in isolated container..."
# Mount the current directory to /workspace in the container
# The entrypoint.sh inside the container will run cmake & make and output to build-docker/
docker run --rm --platform=linux/amd64 \
    -v "$(pwd):/workspace" \
    "$IMAGE_NAME"

echo "=== Build Process Finished ==="
if [ -f "build-docker/planneros-lite" ]; then
    echo "SUCCESS! Binary located at: build-docker/planneros-lite"
    echo "You can now SCP this binary to the device safe workspace."
else
    echo "WARNING: Binary not found. Check build logs for errors."
fi
