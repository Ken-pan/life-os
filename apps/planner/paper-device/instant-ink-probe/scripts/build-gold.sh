#!/bin/bash
set -eo pipefail

cd "$(dirname "$0")/.."

IMAGE_NAME="${PAPEROS_BUILDER_IMAGE:-paperos-builder:latest}"
PLATFORM="${PAPEROS_BUILDER_PLATFORM:-linux/arm64}"
ROOT_DIR="$(cd ../../../.. && pwd)"
HISTORICAL_DIR="$ROOT_DIR/apps/planner-device/remarkable-lite"
HISTORICAL_BUILD_SCRIPT="$HISTORICAL_DIR/scripts/build-remarkable.sh"
HISTORICAL_DOCKERFILE="$HISTORICAL_DIR/docker/Dockerfile"
OUT_DIR="$PWD/build-docker"
REPORT="$OUT_DIR/build-report.txt"
ENV_REPORT="$OUT_DIR/build-env.txt"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/paperos-ink-probe" "$REPORT" "$ENV_REPORT"

if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "Docker image $IMAGE_NAME not found; rebuilding from historical PaperOS Dockerfile."
  docker build --platform="$PLATFORM" -t "$IMAGE_NAME" -f "$HISTORICAL_DOCKERFILE" "$HISTORICAL_DIR/docker"
fi

docker run --rm --platform="$PLATFORM" \
  -v "$PWD:/workspace" \
  -v "$HISTORICAL_DIR:/historical-paperos:ro" \
  --entrypoint /bin/bash \
  "$IMAGE_NAME" -lc '
set +e
ENV_SCRIPT=$(find /opt/poky /opt/codex -name "environment-setup-cortexa55*" -print -quit 2>/dev/null)
if [ -z "$ENV_SCRIPT" ]; then
  echo "Missing chiappa environment setup script" >&2
  exit 1
fi
source "$ENV_SCRIPT"
set -eo pipefail

BUILD_DIR=/tmp/paperos-ink-probe-build
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" /workspace/build-docker

{
  echo "historical_build_command=cd apps/planner-device/remarkable-lite && ./scripts/build-remarkable.sh"
  echo "docker_image=paperos-builder:latest"
  echo "container_cmake=$(command -v cmake)"
  echo "container_make=$(command -v make)"
  echo "cross_cc=$CC"
  echo "cross_cxx=$CXX"
  echo "sysroot=$OECORE_TARGET_SYSROOT"
  echo "native_sysroot=$OECORE_NATIVE_SYSROOT"
  echo "cmake_toolchain_file=${CMAKE_TOOLCHAIN_FILE:-}"
  echo "qt_core_include=$OECORE_TARGET_SYSROOT/usr/include/QtCore"
  echo "qt_gui_include=$OECORE_TARGET_SYSROOT/usr/include/QtGui"
  echo "qt_lib_dir=$OECORE_TARGET_SYSROOT/usr/lib"
  echo "sdk_mount=/opt/codex/chiappa/5.7.119"
  echo "output_binary_path=apps/planner/paper-device/instant-ink-probe/build-docker/paperos-ink-probe"
} > /workspace/build-docker/build-env.txt

cmake -S /workspace -B "$BUILD_DIR"
cmake --build "$BUILD_DIR" --target paperos-ink-probe -j"$(nproc)"
cp "$BUILD_DIR/paperos-ink-probe" /workspace/build-docker/paperos-ink-probe

cd /workspace/build-docker
{
  echo "## file"
  file paperos-ink-probe
  echo
  echo "## readelf -h"
  readelf -h paperos-ink-probe
  echo
  echo "## readelf -d"
  readelf -d paperos-ink-probe
  echo
  echo "## sha256sum"
  sha256sum paperos-ink-probe
  echo
  echo "## NEEDED"
  readelf -d paperos-ink-probe | grep NEEDED || true
  echo
  echo "## forbidden strings"
  forbidden_strings_regex="QQuick|QQml|QGui""Application|QQuick""Window"
  strings paperos-ink-probe | grep -E "$forbidden_strings_regex" || true
} > build-report.txt
'

forbidden_source_regex='QGui''Application|QQml''ApplicationEngine|QQuick''Window|-platform e''paper|QT_QUICK''_BACKEND'
grep -RInE "$forbidden_source_regex" \
  src CMakeLists.txt README.md scripts || true

echo "Built $OUT_DIR/paperos-ink-probe"
cat "$ENV_REPORT"
cat "$REPORT"
