import Foundation

public protocol NetworkInterceptorDelegate: AnyObject {
    func requestDidStart(_ record: RequestRecord)
    func requestDidUpdate(_ record: RequestRecord)
    func requestDidFinish(_ record: RequestRecord)
    func pausedRequestsDidChange(_ count: Int)
}

public class NetworkInterceptor {
    public static let shared = NetworkInterceptor()

    public weak var delegate: NetworkInterceptorDelegate?

    public var isGlobalPaused: Bool = false
    public var denyByDefaultTrackers: Bool = true

    // Requests storage (in-memory only)
    public private(set) var requests: [RequestRecord] = []
    public private(set) var pausedQueue: [String: (record: RequestRecord, proceed: (Data?, Int, [String: String]) -> Void, cancel: () -> Void)] = [:]
    public private(set) var destinations: [String: DestinationGroup] = [:]
    public private(set) var sources: [String: SourceGroup] = [:]

    // Firewall Rules
    public private(set) var rules: [BlockRule] = [
        BlockRule(pattern: "*google-analytics.com*", label: "Google Analytics"),
        BlockRule(pattern: "*googletagmanager.com*", label: "Google Tag Manager"),
        BlockRule(pattern: "*doubleclick.net*", label: "DoubleClick Ads"),
        BlockRule(pattern: "*adservice.google.com*", label: "Google Ad Services"),
        BlockRule(pattern: "*googleadservices.com*", label: "Google Ad Services"),
        BlockRule(pattern: "*facebook.com/tr*", label: "Meta Pixel"),
        BlockRule(pattern: "*fbevents.js*", label: "Meta Pixel Events"),
        BlockRule(pattern: "*clarity.ms*", label: "Microsoft Clarity"),
        BlockRule(pattern: "*segment.io*", label: "Segment Analytics"),
        BlockRule(pattern: "*hotjar.com*", label: "Hotjar Recording"),
        BlockRule(pattern: "*criteo.com*", label: "Criteo Advertising"),
        BlockRule(pattern: "*telemetry*", label: "Generic Telemetry"),
        BlockRule(pattern: "*beacon*", label: "Tracking Beacons")
    ]

    // Ephemeral URLSession (100% in-memory)
    private var session: URLSession

    private let trackerKeywords = [
        "/telemetry", "/analytics", "/tracking", "/tracker",
        "/beacon", "/collect", "/pixel.gif", "/events/log"
    ]

    private init() {
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = URLCache(memoryCapacity: 50 * 1024 * 1024, diskCapacity: 0, diskPath: nil)
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.httpShouldSetCookies = true
        config.httpCookieAcceptPolicy = .never // Strict ephemeral privacy
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)
    }

    // --- Core Request Pipeline ---

    public func execute(
        record: RequestRecord,
        completion: @escaping (Data?, HTTPURLResponse?, Error?) -> Void
    ) {
        // Register in metrics and grouping
        recordRequestStarted(record)

        let urlString = record.url.absoluteString

        // 1. Check Blocklist & Tracker Shield
        if isBlocked(url: urlString) {
            record.state = .blocked
            record.statusText = "Blocked by Client"
            recordRequestFinished(record)
            let err = NSError(domain: "NetScope", code: 403, userInfo: [NSLocalizedDescriptionKey: "Blocked by Firewall"])
            completion(nil, nil, err)
            return
        }

        // 2. Check Paused / Intercept Queue
        if isGlobalPaused {
            record.state = .paused
            record.statusText = "Held in Queue"
            delegate?.requestDidUpdate(record)

            pausedQueue[record.id] = (
                record: record,
                proceed: { [weak self] (modifiedBody, overrideStatus, overrideHeaders) in
                    self?.performHttpTask(record: record, overrideBody: modifiedBody, completion: completion)
                },
                cancel: { [weak self] in
                    record.state = .blocked
                    record.statusText = "Dropped by User"
                    self?.recordRequestFinished(record)
                    let err = NSError(domain: "NetScope", code: 499, userInfo: [NSLocalizedDescriptionKey: "Dropped by User"])
                    completion(nil, nil, err)
                }
            )

            delegate?.pausedRequestsDidChange(pausedQueue.count)
            return
        }

        // 3. Normal Execution
        performHttpTask(record: record, overrideBody: nil, completion: completion)
    }

    private func performHttpTask(
        record: RequestRecord,
        overrideBody: Data?,
        completion: @escaping (Data?, HTTPURLResponse?, Error?) -> Void
    ) {
        var req = URLRequest(url: record.url)
        req.httpMethod = record.method
        req.allHTTPHeaderFields = record.requestHeaders
        req.httpBody = overrideBody ?? record.requestBody

        // Sanitize headers: clean Chrome User-Agent, DNT, Sec-GPC
        req.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", forHTTPHeaderField: "User-Agent")
        req.setValue("1", forHTTPHeaderField: "DNT")
        req.setValue("1", forHTTPHeaderField: "Sec-GPC")

        let startTime = Date()

        let task = session.dataTask(with: req) { [weak self] data, response, error in
            let duration = Date().timeIntervalSince(startTime) * 1000.0
            record.durationMs = duration

            if let httpRes = response as? HTTPURLResponse {
                record.statusCode = httpRes.statusCode
                record.statusText = "\(httpRes.statusCode)"
                record.bytesTransferred = data?.count ?? 0

                var headersDict: [String: String] = [:]
                for (k, v) in httpRes.allHeaderFields {
                    headersDict[String(describing: k)] = String(describing: v)
                }
                record.responseHeaders = headersDict
                record.responseBody = data
                record.state = .completed
            } else if let error = error {
                record.state = .failed
                record.statusText = "Failed"
                record.errorText = error.localizedDescription
            }

            self?.recordRequestFinished(record)
            completion(data, response as? HTTPURLResponse, error)
        }

        task.resume()
    }

    // --- Pause & Intercept Controls ---

    public func setGlobalPause(_ paused: Bool) {
        self.isGlobalPaused = paused
    }

    public func resumePausedRequest(id: String, modifiedData: Data? = nil) {
        guard let item = pausedQueue.removeValue(forKey: id) else { return }
        delegate?.pausedRequestsDidChange(pausedQueue.count)
        item.proceed(modifiedData, 200, [:])
    }

    public func dropPausedRequest(id: String) {
        guard let item = pausedQueue.removeValue(forKey: id) else { return }
        delegate?.pausedRequestsDidChange(pausedQueue.count)
        item.cancel()
    }

    public func fulfillPausedRequest(id: String, statusCode: Int, body: Data, headers: [String: String] = [:]) {
        guard let item = pausedQueue.removeValue(forKey: id) else { return }
        delegate?.pausedRequestsDidChange(pausedQueue.count)

        item.record.statusCode = statusCode
        item.record.statusText = "\(statusCode) Mocked"
        item.record.responseBody = body
        item.record.responseHeaders = headers
        item.record.state = .completed
        recordRequestFinished(item.record)

        _ = HTTPURLResponse(url: item.record.url, statusCode: statusCode, httpVersion: "HTTP/1.1", headerFields: headers)
        // Simulate immediate response
    }

    public func resumeAllPaused() {
        let keys = Array(pausedQueue.keys)
        for key in keys {
            resumePausedRequest(id: key)
        }
    }

    // --- Firewall & Rules ---

    public func isBlocked(url: String) -> Bool {
        // User rules
        for i in 0..<rules.count {
            if rules[i].enabled && matchesPattern(string: url, pattern: rules[i].pattern) {
                rules[i].hits += 1
                return true
            }
        }

        // Heuristic tracker check
        if denyByDefaultTrackers {
            let lower = url.lowercased()
            for kw in trackerKeywords {
                if lower.contains(kw) {
                    return true
                }
            }
            if let u = URL(string: url), let host = u.host?.lowercased() {
                if host.contains("telemetry") || host.contains("analytics") ||
                   host.contains("tracker") || host.contains("metrics") ||
                   host.contains("pixel") || host.contains("beacon") ||
                   host.contains("adservice") || host.contains("adserver") {
                    return true
                }
            }
        }

        return false
    }

    public func addBlockRule(pattern: String, label: String) {
        let r = BlockRule(pattern: pattern, label: label)
        rules.append(r)
    }

    public func toggleRule(id: String) {
        if let idx = rules.firstIndex(where: { $0.id == id }) {
            rules[idx].enabled.toggle()
        }
    }

    public func removeRule(id: String) {
        rules.removeAll(where: { $0.id == id })
    }

    private func matchesPattern(string: String, pattern: String) -> Bool {
        let escaped = NSRegularExpression.escapedPattern(for: pattern).replacingOccurrences(of: "\\*", with: ".*")
        let regex = try? NSRegularExpression(pattern: "^" + escaped + "$", options: .caseInsensitive)
        let range = NSRange(location: 0, length: string.utf16.count)
        return regex?.firstMatch(in: string, options: [], range: range) != nil
    }

    // --- Metrics & Grouping Management ---

    public func recordRequestStarted(_ record: RequestRecord) {
        let update = { [weak self] in
            guard let self = self else { return }
            self.requests.insert(record, at: 0)
            if self.requests.count > 500 {
                self.requests.removeLast()
            }

            // Destination Grouping
            let dest = record.destination
            if let group = self.destinations[dest] {
                group.count += 1
                group.requests.append(record)
            } else {
                let group = DestinationGroup(host: dest)
                group.count = 1
                group.requests.append(record)
                self.destinations[dest] = group
            }

            // Source Grouping
            let src = record.source
            if let group = self.sources[src] {
                group.count += 1
                group.requests.append(record)
            } else {
                let group = SourceGroup(source: src)
                group.count = 1
                group.requests.append(record)
                self.sources[src] = group
            }

            self.delegate?.requestDidStart(record)
        }

        if Thread.isMainThread {
            update()
        } else {
            DispatchQueue.main.async(execute: update)
        }
    }

    public func recordRequestFinished(_ record: RequestRecord) {
        let update = { [weak self] in
            guard let self = self else { return }
            if let group = self.destinations[record.destination] {
                group.bytes += record.bytesTransferred
            }
            self.delegate?.requestDidFinish(record)
        }

        if Thread.isMainThread {
            update()
        } else {
            DispatchQueue.main.async(execute: update)
        }
    }

    public func clearHistory() {
        let update = { [weak self] in
            self?.requests.removeAll()
            self?.destinations.removeAll()
            self?.sources.removeAll()
            self?.pausedQueue.removeAll()
            self?.delegate?.pausedRequestsDidChange(0)
        }

        if Thread.isMainThread {
            update()
        } else {
            DispatchQueue.main.async(execute: update)
        }
    }
}
