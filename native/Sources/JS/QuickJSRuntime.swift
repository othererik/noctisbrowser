import Foundation

public class QuickJSRuntime {
    private var runtime: OpaquePointer?
    private var context: OpaquePointer?

    public var consoleLogs: [String] = []
    public var onConsoleLog: ((String) -> Void)?

    public init() {
        self.runtime = JS_NewRuntime()
        self.context = JS_NewContext(runtime)
        setupEnvironment()
    }

    deinit {
        if let ctx = context {
            JS_FreeContext(ctx)
        }
        if let rt = runtime {
            JS_FreeRuntime(rt)
        }
    }

    private func setupEnvironment() {
        guard let ctx = context else { return }

        // Setup global console.log
        let globalObj = JS_GetGlobalObject(ctx)

        let consoleScript = """
        globalThis.console = {
            log: function(...args) { __native_log(args.join(' ')); },
            warn: function(...args) { __native_log('[WARN] ' + args.join(' ')); },
            error: function(...args) { __native_log('[ERROR] ' + args.join(' ')); }
        };
        globalThis.window = globalThis;
        globalThis.document = {
            title: "",
            readyState: "complete",
            head: {},
            body: { appendChild: function(){} },
            documentElement: {},
            getElementById: function(id) { return null; },
            getElementsByTagName: function(tag) { return []; },
            getElementsByClassName: function(cls) { return []; },
            querySelector: function(sel) { return null; },
            querySelectorAll: function(sel) { return []; },
            createElement: function(tag) { 
                return { 
                    setAttribute: function(){}, 
                    getAttribute: function(){ return null; },
                    appendChild: function(){},
                    addEventListener: function(){},
                    style: {}
                }; 
            },
            addEventListener: function(type, listener) {},
            removeEventListener: function(type, listener) {}
        };
        globalThis.addEventListener = function(type, listener) {};
        globalThis.removeEventListener = function(type, listener) {};
        globalThis.location = {
            href: "",
            protocol: "https:",
            host: "",
            hostname: "",
            pathname: "/",
            search: "",
            hash: ""
        };
        globalThis.navigator = {
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            platform: "MacIntel",
            language: "en-US",
            languages: ["en-US", "en"],
            cookieEnabled: false,
            onLine: true
        };
        globalThis.localStorage = {
            getItem: function() { return null; },
            setItem: function() {},
            removeItem: function() {},
            clear: function() {}
        };
        globalThis.sessionStorage = globalThis.localStorage;
        globalThis.setTimeout = function(fn, delay) { if (typeof fn === 'function') fn(); return 1; };
        globalThis.clearTimeout = function() {};
        globalThis.setInterval = function() { return 1; };
        globalThis.clearInterval = function() {};
        """
        evaluate(script: consoleScript, filename: "<env>")

        // Expose C callback for __native_log
        let logFunc = JS_NewCFunction(ctx, { (ctx, thisVal, argc, argv) -> JSValue in
            guard let argv = argv, argc > 0 else { return netscope_js_undefined() }
            if let cStr = JS_ToCString(ctx, argv[0]) {
                let msg = String(cString: cStr)
                JS_FreeCString(ctx, cStr)
                let post = {
                    NotificationCenter.default.post(name: NSNotification.Name("QuickJSConsoleLog"), object: msg)
                }
                if Thread.isMainThread {
                    post()
                } else {
                    DispatchQueue.main.async(execute: post)
                }
            }
            return netscope_js_undefined()
        }, "__native_log", 1)

        JS_SetPropertyStr(ctx, globalObj, "__native_log", logFunc)

        // Expose native fetch API that routes through NetworkInterceptor!
        let fetchFunc = JS_NewCFunction(ctx, { (ctx, thisVal, argc, argv) -> JSValue in
            guard let argv = argv, argc > 0 else { return netscope_js_undefined() }
            var urlString = ""
            if let cStr = JS_ToCString(ctx, argv[0]) {
                urlString = String(cString: cStr)
                JS_FreeCString(ctx, cStr)
            }

            guard let url = URL(string: urlString) else { return netscope_js_undefined() }

            // Route through NetworkInterceptor with source tagged as QuickJS
            let record = RequestRecord(
                url: url,
                method: "GET",
                source: "QuickJS Script",
                resourceType: "API/Fetch"
            )

            NetworkInterceptor.shared.execute(record: record) { data, response, error in
                if let data = data {
                    NotificationCenter.default.post(name: NSNotification.Name("QuickJSConsoleLog"), object: "[fetch] Completed: \(urlString) (\(data.count) bytes)")
                }
            }

            return netscope_js_undefined()
        }, "fetch", 1)

        JS_SetPropertyStr(ctx, globalObj, "fetch", fetchFunc)

        netscope_js_free_value(ctx, globalObj)
    }

    @discardableResult
    public func evaluate(script: String, filename: String = "<script>") -> String? {
        guard let ctx = context else { return nil }
        let val = JS_Eval(ctx, script, script.utf8.count, filename, 0)
        defer { netscope_js_free_value(ctx, val) }

        if netscope_js_is_exception(val) != 0 {
            let exc = JS_GetException(ctx)
            defer { netscope_js_free_value(ctx, exc) }
            if let cStr = JS_ToCString(ctx, exc) {
                let errStr = String(cString: cStr)
                JS_FreeCString(ctx, cStr)
                return "Error: \(errStr)"
            }
            return "Unknown Script Error"
        }

        if let cStr = JS_ToCString(ctx, val) {
            let resStr = String(cString: cStr)
            JS_FreeCString(ctx, cStr)
            return resStr
        }

        return nil
    }
}
