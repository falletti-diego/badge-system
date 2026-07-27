#!/bin/bash
set -e

AVD_NAME="${1:-Pixel_6_API_34}"

cleanup() {
  kill $METRO_PID 2>/dev/null || true
}
trap cleanup EXIT

if ! adb devices | grep -q "device$"; then
  echo "Avvio emulatore $AVD_NAME..."
  emulator -avd "$AVD_NAME" -gpu swiftshader_indirect &
  adb wait-for-device
  # Attende che il boot sia completo, non solo che adb risponda
  until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do
    sleep 2
  done
fi

npx expo start --dev-client &
METRO_PID=$!
sleep 5

maestro test maestro/
