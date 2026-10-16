#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=== Starting NetScope Native Browser (Swift + QuickJS) ==="
echo "Ephemeral zero-trace mode: ON"
echo "WebKit/Blink/Chromium engine: NONE (Fully Custom Lightweight Engine)"
echo "JS Engine: Embedded QuickJS"
echo "Binary path: ./native/build/NetScopeNative"

if [ ! -f "./native/build/NetScopeNative" ]; then
    echo "NetScopeNative binary not found. Building first..."
    mkdir -p native/build
    clang -c native/bridge.c -I quickjs-src -o native/build/bridge.o
    swiftc -I quickjs-src -import-objc-header native/bridge.h \
      native/Sources/Models/NetworkModels.swift \
      native/Sources/Networking/NetworkInterceptor.swift \
      native/Sources/JS/QuickJSRuntime.swift \
      native/Sources/Renderer/HTMLParser.swift \
      native/Sources/Renderer/DocumentView.swift \
      native/Sources/UI/InspectorView.swift \
      native/Sources/UI/CockpitView.swift \
      native/Sources/UI/MainWindowController.swift \
      native/Sources/main.swift \
      native/build/bridge.o \
      quickjs-src/libquickjs.a \
      -o native/build/NetScopeNative
fi

exec "./native/build/NetScopeNative" "$@"
