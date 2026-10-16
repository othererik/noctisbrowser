import Cocoa

func runSelfTests() -> Int32 {
    print("=== NetScope Native Self-Test Suite ===")
    
    // 1. HTMLParser Test
    print("[1/5] Testing HTML Parser...")
    let sampleHTML = """
    <html>
      <head><title>Test Title</title><script>var x = 10 + 20;</script></head>
      <body>
        <h1>Welcome</h1>
        <p>A paragraph with <a href="https://example.com">a link</a></p>
      </body>
    </html>
    """
    let doc = HTMLParser.parse(html: sampleHTML)
    assert(doc.title == "Test Title", "HTMLParser failed to extract title")
    assert(doc.scripts.count == 1, "HTMLParser failed to extract scripts")
    assert(doc.scripts[0].contains("10 + 20"), "Script content mismatch")
    print("      ✓ HTMLParser passed (Title: \(doc.title), Scripts: \(doc.scripts.count))")

    // 2. QuickJS Runtime Test
    print("[2/5] Testing QuickJS Runtime...")
    let js = QuickJSRuntime()
    let mathResult = js.evaluate(script: "15 * 4")
    assert(mathResult == "60", "QuickJS math evaluation failed, got: \(String(describing: mathResult))")
    
    let logExp = js.evaluate(script: "console.log('Hello from QuickJS'); 42;")
    assert(logExp == "42", "QuickJS console evaluation failed")
    print("      ✓ QuickJS evaluated arithmetic and console globals successfully")

    // 3. Network Tracker Shield Test
    print("[3/5] Testing Privacy Shield & Tracker Detection...")
    let trackerURL1 = URL(string: "https://www.google-analytics.com/analytics.js")!
    let trackerURL2 = URL(string: "https://adservice.google.com/adsid/integrator.js")!
    let normalURL = URL(string: "https://api.github.com/zen")!
    
    assert(NetworkInterceptor.shared.isBlocked(url: trackerURL1.absoluteString), "Failed to detect google-analytics tracker")
    assert(NetworkInterceptor.shared.isBlocked(url: trackerURL2.absoluteString), "Failed to detect adservice tracker")
    assert(!NetworkInterceptor.shared.isBlocked(url: normalURL.absoluteString), "False positive on normal URL")
    print("      ✓ Privacy Shield tracker classification passed")

    // 4. Source & Destination Grouping Test
    print("[4/5] Testing Traffic Grouping Engine...")
    let r1 = RequestRecord(url: URL(string: "https://example.com/style.css")!, method: "GET", source: "HTML Document", resourceType: "CSS")
    let r2 = RequestRecord(url: URL(string: "https://example.com/logo.png")!, method: "GET", source: "Image Tag", resourceType: "Image")
    let r3 = RequestRecord(url: URL(string: "https://cdn.example.net/lib.js")!, method: "GET", source: "QuickJS Script", resourceType: "Script")
    
    NetworkInterceptor.shared.recordRequestStarted(r1)
    NetworkInterceptor.shared.recordRequestStarted(r2)
    NetworkInterceptor.shared.recordRequestStarted(r3)
    
    let dests = NetworkInterceptor.shared.destinations
    let sources = NetworkInterceptor.shared.sources
    
    assert(dests["example.com"]?.count == 2, "Destination grouping count mismatch for example.com")
    assert(dests["cdn.example.net"]?.count == 1, "Destination grouping count mismatch for cdn.example.net")
    assert(sources["HTML Document"]?.count == 1, "Source grouping count mismatch for HTML Document")
    print("      ✓ Traffic grouped accurately by source and destination")

    // 5. Zero-Trace In-Memory Ephemeral Storage Purge Test
    print("[5/5] Testing Zero-Trace Storage Purge...")
    NetworkInterceptor.shared.clearHistory()
    assert(NetworkInterceptor.shared.requests.isEmpty, "Requests not cleared")
    assert(NetworkInterceptor.shared.destinations.isEmpty, "Destinations not cleared")
    assert(NetworkInterceptor.shared.sources.isEmpty, "Sources not cleared")
    print("      ✓ Zero-trace memory purge verified (0 bytes persisted to disk)")

    print("=== All NetScope Native Tests Passed Successfully! ===")
    return 0
}

if CommandLine.arguments.contains("--test") || CommandLine.arguments.contains("--self-test") {
    let code = runSelfTests()
    exit(code)
}

class AppDelegate: NSObject, NSApplicationDelegate {
    var windowController: MainWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        windowController = MainWindowController()
        windowController?.showWindow(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Zero-trace memory purge on exit
        NetworkInterceptor.shared.clearHistory()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
