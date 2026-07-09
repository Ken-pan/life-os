# Use a stable base image without hardcoding the platform
FROM ubuntu:22.04

# Avoid tzdata/interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install essential build dependencies required by Yocto SDK and CMake
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    python3 \
    ninja-build \
    file \
    && rm -rf /var/lib/apt/lists/*

# Set up the working directory inside the container
WORKDIR /workspace

# Copy the SDK installer into the container
# The user must have placed the .sh installer in the sdk-installer/ directory
COPY sdk-installer/*.sh /tmp/sdk-installer.sh

# Make the installer executable and run it automatically answering 'y' to prompts
# It defaults to installing in /opt/poky/5.7.126 (or similar, depending on SDK version)
RUN chmod +x /tmp/sdk-installer.sh && \
    /tmp/sdk-installer.sh -y && \
    rm /tmp/sdk-installer.sh

# Create an entrypoint script to source the environment and run cmake/make
RUN echo '#!/bin/bash\n\
# Find the environment setup script (can be in /opt/poky or /opt/codex)\n\
ENV_SCRIPT=$(find /opt/poky /opt/codex -name "environment-setup-cortexa55*" -print -quit 2>/dev/null)\n\
if [ -z "$ENV_SCRIPT" ]; then\n\
    echo "Error: Could not find Yocto environment setup script."\n\
    exit 1\n\
fi\n\
\n\
echo "Sourcing toolchain: $ENV_SCRIPT"\n\
source "$ENV_SCRIPT"\n\
\n\
set -e\n\
echo "Host Architecture: $(uname -m)"\n\
echo "Target Architecture: $CC"\n\
\n\
mkdir -p build-docker\n\
cd build-docker\n\
\n\
echo "Running CMake..."\n\
cmake ..\n\
\n\
echo "Running Make..."\n\
make -j$(nproc)\n\
\n\
echo "Build complete. Artifacts are in build-docker/"\n\
' > /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
