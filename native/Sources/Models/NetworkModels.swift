import Foundation

public enum RequestState: String, Codable {
    case pending = "PENDING"
    case completed = "COMPLETED"
    case failed = "FAILED"
    case blocked = "BLOCKED"
    case paused = "PAUSED"
}

public class RequestRecord: Identifiable, ObservableObject {
    public let id: String
    public let url: URL
    public let method: String
    public var requestHeaders: [String: String]
    public var requestBody: Data?
    public var responseHeaders: [String: String]
    public var responseBody: Data?
    public var statusCode: Int?
    public var statusText: String
    public var state: RequestState
    public let source: String
    public let destination: String
    public let resourceType: String
    public let startTime: Date
    public var durationMs: Double
    public var bytesTransferred: Int
    public var errorText: String?

    public init(
        id: String = UUID().uuidString,
        url: URL,
        method: String = "GET",
        requestHeaders: [String: String] = [:],
        requestBody: Data? = nil,
        source: String = "Document",
        resourceType: String = "Other"
    ) {
        self.id = id
        self.url = url
        self.method = method
        self.requestHeaders = requestHeaders
        self.requestBody = requestBody
        self.responseHeaders = [:]
        self.responseBody = nil
        self.statusCode = nil
        self.statusText = "Pending"
        self.state = .pending
        self.source = source
        self.destination = url.host ?? "Unknown"
        self.resourceType = resourceType
        self.startTime = Date()
        self.durationMs = 0
        self.bytesTransferred = 0
        self.errorText = nil
    }

    public var formattedSize: String {
        let b = bytesTransferred
        if b < 1024 { return "\(b) B" }
        if b < 1024 * 1024 { return String(format: "%.1f KB", Double(b) / 1024.0) }
        return String(format: "%.1f MB", Double(b) / (1024.0 * 1024.0))
    }

    public var formattedDuration: String {
        if durationMs < 1 { return "..." }
        return "\(Int(durationMs))ms"
    }
}

public class DestinationGroup {
    public let host: String
    public var count: Int
    public var bytes: Int
    public var requests: [RequestRecord]
    public var isBlocked: Bool

    public init(host: String) {
        self.host = host
        self.count = 0
        self.bytes = 0
        self.requests = []
        self.isBlocked = false
    }

    public var formattedSize: String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return String(format: "%.1f KB", Double(bytes) / 1024.0) }
        return String(format: "%.1f MB", Double(bytes) / (1024.0 * 1024.0))
    }
}

public class SourceGroup {
    public let source: String
    public var count: Int
    public var requests: [RequestRecord]

    public init(source: String) {
        self.source = source
        self.count = 0
        self.requests = []
    }
}

public struct BlockRule: Identifiable {
    public let id: String
    public var pattern: String
    public var label: String
    public var enabled: Bool
    public var hits: Int

    public init(id: String = UUID().uuidString, pattern: String, label: String, enabled: Bool = true, hits: Int = 0) {
        self.id = id
        self.pattern = pattern
        self.label = label
        self.enabled = enabled
        self.hits = hits
    }
}
