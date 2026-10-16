#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=== Running NetScope Native Engine Test Suite ==="

if [ ! -f "./native/build/test_runner" ]; then
    echo "test_runner binary not found. Compiling..."
    mkdir -p native/build
    clang -c native/bridge.c -I quickjs-src -o native/build/bridge.o
    swiftc -I quickjs-src -import-objc-header native/bridge.h \
      native/Sources/Models/NetworkModels.swift \
      native/Sources/Networking/NetworkInterceptor.swift \
      native/Sources/JS/QuickJSRuntime.swift \
      native/Sources/Renderer/HTMLParser.swift \
      native/Tests/test_runner.swift \
      native/build/bridge.o \
      quickjs-src/libquickjs.a \
      -o native/build/test_runner
fi

python3 -c "import subprocess, sys; res = subprocess.run(['$DIR/native/build/test_runner']); sys.exit(res.returncode)"
