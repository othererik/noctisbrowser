import Cocoa

public class InspectorView: NSView {
    private var summaryLabel: NSTextField!
    private var segmentedControl: NSSegmentedControl!
    private var contentTextView: NSTextView!
    private var currentRecord: RequestRecord?

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupUI()
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    private func setupUI() {
        self.wantsLayer = true
        self.layer?.backgroundColor = NSColor(calibratedRed: 0.08, green: 0.11, blue: 0.17, alpha: 1.0).cgColor

        // Top bar
        summaryLabel = NSTextField(labelWithString: "Select a request to inspect details")
        summaryLabel.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .medium)
        summaryLabel.textColor = NSColor(calibratedRed: 0.85, green: 0.88, blue: 0.92, alpha: 1.0)
        summaryLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(summaryLabel)

        segmentedControl = NSSegmentedControl(labels: ["Headers", "Request Body", "Response Body", "Timing"], trackingMode: .selectOne, target: self, action: #selector(tabChanged))
        segmentedControl.selectedSegment = 0
        segmentedControl.translatesAutoresizingMaskIntoConstraints = false
        addSubview(segmentedControl)

        // Text view for details
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.drawsBackground = false

        contentTextView = NSTextView()
        contentTextView.isEditable = false
        contentTextView.isSelectable = true
        contentTextView.drawsBackground = true
        contentTextView.backgroundColor = NSColor(calibratedRed: 0.04, green: 0.06, blue: 0.09, alpha: 1.0)
        contentTextView.textColor = NSColor(calibratedRed: 0.90, green: 0.92, blue: 0.95, alpha: 1.0)
        contentTextView.font = NSFont.monospacedSystemFont(ofSize: 11.5, weight: .regular)
        contentTextView.textContainerInset = NSSize(width: 12, height: 10)

        scroll.documentView = contentTextView
        addSubview(scroll)

        NSLayoutConstraint.activate([
            summaryLabel.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            summaryLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            summaryLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),

            segmentedControl.topAnchor.constraint(equalTo: summaryLabel.bottomAnchor, constant: 6),
            segmentedControl.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),

            scroll.topAnchor.constraint(equalTo: segmentedControl.bottomAnchor, constant: 8),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
    }

    public func inspect(record: RequestRecord) {
        self.currentRecord = record
        let status = record.statusCode != nil ? "\(record.statusCode!)" : record.statusText
        summaryLabel.stringValue = "[\(record.method)] \(status) - \(record.url.absoluteString)"
        updateContent()
    }

    @objc private func tabChanged() {
        updateContent()
    }

    private func updateContent() {
        guard let record = currentRecord else {
            contentTextView.string = "No request selected."
            return
        }

        switch segmentedControl.selectedSegment {
        case 0:
            // Headers
            var text = "=== GENERAL ===\n"
            text += "URL: \(record.url.absoluteString)\n"
            text += "Method: \(record.method)\n"
            text += "Status: \(record.statusCode != nil ? "\(record.statusCode!)" : record.statusText)\n"
            text += "Initiator: \(record.source)\n"
            text += "Type: \(record.resourceType)\n\n"

            text += "=== RESPONSE HEADERS ===\n"
            if record.responseHeaders.isEmpty {
                text += "(No response headers received yet)\n"
            } else {
                for (k, v) in record.responseHeaders.sorted(by: { $0.key < $1.key }) {
                    text += "\(k): \(v)\n"
                }
            }

            text += "\n=== REQUEST HEADERS ===\n"
            for (k, v) in record.requestHeaders.sorted(by: { $0.key < $1.key }) {
                text += "\(k): \(v)\n"
            }

            contentTextView.string = text

        case 1:
            // Request Body
            if let body = record.requestBody, let str = String(data: body, encoding: .utf8) {
                contentTextView.string = str
            } else {
                contentTextView.string = "(No request payload body)"
            }

        case 2:
            // Response Body
            if let body = record.responseBody, let str = String(data: body, encoding: .utf8) {
                contentTextView.string = str
            } else {
                contentTextView.string = "(No response body available or pending)"
            }

        case 3:
            // Timing
            var text = "=== TIMING BREAKDOWN ===\n"
            text += "Total Latency: \(record.formattedDuration)\n"
            text += "Bytes Transferred: \(record.formattedSize)\n"
            text += "Started: \(record.startTime)\n"
            contentTextView.string = text

        default:
            break
        }
    }
}
