import Cocoa

public class CockpitView: NSView, NSTableViewDataSource, NSTableViewDelegate, NetworkInterceptorDelegate {
    private var tickerLabel: NSTextField!
    private var pauseButton: NSButton!
    private var segmentedControl: NSSegmentedControl!

    private var splitView: NSSplitView!
    private var tableView: NSTableView!
    private var inspectorView: InspectorView!

    private var activeMode: Int = 0 // 0: Stream, 1: Destinations, 2: Sources, 3: Intercept, 4: Firewall

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupUI()
        NetworkInterceptor.shared.delegate = self
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
        NetworkInterceptor.shared.delegate = self
    }

    private func setupUI() {
        self.wantsLayer = true
        self.layer?.backgroundColor = NSColor(calibratedRed: 0.07, green: 0.09, blue: 0.14, alpha: 1.0).cgColor

        // Header View
        let headerView = NSView()
        headerView.translatesAutoresizingMaskIntoConstraints = false
        headerView.wantsLayer = true
        headerView.layer?.backgroundColor = NSColor(calibratedRed: 0.09, green: 0.12, blue: 0.18, alpha: 1.0).cgColor
        addSubview(headerView)

        let titleLabel = NSTextField(labelWithString: "⚡ NETWORK COCKPIT")
        titleLabel.font = NSFont.boldSystemFont(ofSize: 11)
        titleLabel.textColor = NSColor(calibratedRed: 0.23, green: 0.71, blue: 0.83, alpha: 1.0)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        headerView.addSubview(titleLabel)

        tickerLabel = NSTextField(labelWithString: "0 reqs • 0 B • 0 blkd • 0 hold")
        tickerLabel.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        tickerLabel.textColor = NSColor(calibratedRed: 0.70, green: 0.75, blue: 0.82, alpha: 1.0)
        tickerLabel.translatesAutoresizingMaskIntoConstraints = false
        headerView.addSubview(tickerLabel)

        pauseButton = NSButton(title: "⏸ Pause", target: self, action: #selector(togglePauseClicked))
        pauseButton.bezelStyle = .rounded
        pauseButton.font = NSFont.boldSystemFont(ofSize: 11)
        pauseButton.translatesAutoresizingMaskIntoConstraints = false
        headerView.addSubview(pauseButton)

        let clearButton = NSButton(title: "Clear", target: self, action: #selector(clearHistoryClicked))
        clearButton.bezelStyle = .rounded
        clearButton.font = NSFont.systemFont(ofSize: 11)
        clearButton.translatesAutoresizingMaskIntoConstraints = false
        headerView.addSubview(clearButton)

        // Mode Switcher
        segmentedControl = NSSegmentedControl(labels: ["Live Stream", "Destinations", "Sources", "Intercept", "Firewall"], trackingMode: .selectOne, target: self, action: #selector(modeChanged))
        segmentedControl.selectedSegment = 0
        segmentedControl.translatesAutoresizingMaskIntoConstraints = false
        addSubview(segmentedControl)

        // Split view containing table and inspector
        splitView = NSSplitView()
        splitView.isVertical = false
        splitView.dividerStyle = .thin
        splitView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(splitView)

        // Table scroll view
        let tableScroll = NSScrollView()
        tableScroll.hasVerticalScroller = true
        tableScroll.autohidesScrollers = true

        tableView = NSTableView()
        tableView.headerView = NSTableHeaderView()
        tableView.dataSource = self
        tableView.delegate = self
        tableView.backgroundColor = NSColor(calibratedRed: 0.05, green: 0.07, blue: 0.11, alpha: 1.0)
        tableView.gridColor = NSColor(calibratedRed: 0.12, green: 0.15, blue: 0.22, alpha: 1.0)
        tableView.gridStyleMask = [.solidHorizontalGridLineMask]
        tableView.rowHeight = 22

        setupTableColumns()
        tableScroll.documentView = tableView
        splitView.addSubview(tableScroll)

        // Inspector drawer
        inspectorView = InspectorView()
        splitView.addSubview(inspectorView)
        splitView.setPosition(320, ofDividerAt: 0)

        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: topAnchor),
            headerView.leadingAnchor.constraint(equalTo: leadingAnchor),
            headerView.trailingAnchor.constraint(equalTo: trailingAnchor),
            headerView.heightAnchor.constraint(equalToConstant: 42),

            titleLabel.leadingAnchor.constraint(equalTo: headerView.leadingAnchor, constant: 12),
            titleLabel.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),

            tickerLabel.leadingAnchor.constraint(equalTo: titleLabel.trailingAnchor, constant: 10),
            tickerLabel.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),

            clearButton.trailingAnchor.constraint(equalTo: headerView.trailingAnchor, constant: -10),
            clearButton.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),

            pauseButton.trailingAnchor.constraint(equalTo: clearButton.leadingAnchor, constant: -6),
            pauseButton.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),

            segmentedControl.topAnchor.constraint(equalTo: headerView.bottomAnchor, constant: 8),
            segmentedControl.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            segmentedControl.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),

            splitView.topAnchor.constraint(equalTo: segmentedControl.bottomAnchor, constant: 8),
            splitView.leadingAnchor.constraint(equalTo: leadingAnchor),
            splitView.trailingAnchor.constraint(equalTo: trailingAnchor),
            splitView.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
    }

    private func setupTableColumns() {
        tableView.tableColumns.forEach { tableView.removeTableColumn($0) }

        let colStatus = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("colStatus"))
        colStatus.title = "Status"
        colStatus.width = 54

        let colMethod = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("colMethod"))
        colMethod.title = "Method"
        colMethod.width = 50

        let colHost = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("colHost"))
        colHost.title = "Destination"
        colHost.width = 140

        let colPath = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("colPath"))
        colPath.title = "Path / URL"
        colPath.width = 180

        let colSize = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("colSize"))
        colSize.title = "Size"
        colSize.width = 55

        let colTime = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("colTime"))
        colTime.title = "Time"
        colTime.width = 50

        tableView.addTableColumn(colStatus)
        tableView.addTableColumn(colMethod)
        tableView.addTableColumn(colHost)
        tableView.addTableColumn(colPath)
        tableView.addTableColumn(colSize)
        tableView.addTableColumn(colTime)
    }

    @objc private func togglePauseClicked() {
        let isPaused = !NetworkInterceptor.shared.isGlobalPaused
        NetworkInterceptor.shared.setGlobalPause(isPaused)
        pauseButton.title = isPaused ? "▶ Resume" : "⏸ Pause"
        pauseButton.contentTintColor = isPaused ? NSColor.systemOrange : nil
    }

    @objc private func clearHistoryClicked() {
        NetworkInterceptor.shared.clearHistory()
        updateTicker()
        tableView.reloadData()
    }

    @objc private func modeChanged() {
        activeMode = segmentedControl.selectedSegment
        tableView.reloadData()
    }

    private func updateTicker() {
        let reqs = NetworkInterceptor.shared.requests
        var totalBytes = 0
        var totalBlocked = 0
        for r in reqs {
            totalBytes += r.bytesTransferred
            if r.state == .blocked { totalBlocked += 1 }
        }

        let pausedCount = NetworkInterceptor.shared.pausedQueue.count
        let sizeStr = totalBytes < 1024 * 1024 ? "\(totalBytes / 1024) KB" : String(format: "%.1f MB", Double(totalBytes) / (1024.0 * 1024.0))
        tickerLabel.stringValue = "\(reqs.count) reqs • \(sizeStr) • \(totalBlocked) blkd • \(pausedCount) hold"
    }

    // --- TableView DataSource & Delegate ---

    public func numberOfRows(in tableView: NSTableView) -> Int {
        switch activeMode {
        case 0: // Live Stream
            return NetworkInterceptor.shared.requests.count
        case 1: // Destinations
            return NetworkInterceptor.shared.destinations.count
        case 2: // Sources
            return NetworkInterceptor.shared.sources.count
        case 3: // Intercept
            return NetworkInterceptor.shared.pausedQueue.count
        case 4: // Firewall
            return NetworkInterceptor.shared.rules.count
        default:
            return 0
        }
    }

    public func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard let col = tableColumn else { return nil }
        let cell = NSTextField(labelWithString: "")
        cell.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        cell.textColor = NSColor(calibratedRed: 0.90, green: 0.92, blue: 0.95, alpha: 1.0)

        switch activeMode {
        case 0: // Live Stream
            let reqs = NetworkInterceptor.shared.requests
            guard row < reqs.count else { return nil }
            let req = reqs[row]

            switch col.identifier.rawValue {
            case "colStatus":
                cell.stringValue = req.statusCode != nil ? "\(req.statusCode!)" : req.statusText
                cell.textColor = req.state == .blocked ? NSColor.systemPurple : (req.state == .paused ? NSColor.systemOrange : NSColor.systemGreen)
            case "colMethod":
                cell.stringValue = req.method
                cell.textColor = req.method == "POST" ? NSColor.systemGreen : NSColor.systemTeal
            case "colHost":
                cell.stringValue = req.destination
            case "colPath":
                cell.stringValue = req.url.path.isEmpty ? "/" : req.url.path
            case "colSize":
                cell.stringValue = req.formattedSize
            case "colTime":
                cell.stringValue = req.formattedDuration
            default:
                break
            }

        case 1: // Destinations
            let sortedDests = Array(NetworkInterceptor.shared.destinations.values).sorted(by: { $0.count > $1.count })
            guard row < sortedDests.count else { return nil }
            let d = sortedDests[row]
            switch col.identifier.rawValue {
            case "colStatus": cell.stringValue = "\(d.count) reqs"
            case "colMethod": cell.stringValue = "HOST"
            case "colHost": cell.stringValue = d.host
            case "colPath": cell.stringValue = "\(d.requests.count) endpoints"
            case "colSize": cell.stringValue = d.formattedSize
            default: break
            }

        case 2: // Sources
            let sortedSrcs = Array(NetworkInterceptor.shared.sources.values).sorted(by: { $0.count > $1.count })
            guard row < sortedSrcs.count else { return nil }
            let s = sortedSrcs[row]
            switch col.identifier.rawValue {
            case "colStatus": cell.stringValue = "\(s.count) calls"
            case "colMethod": cell.stringValue = "SRC"
            case "colHost": cell.stringValue = s.source
            default: break
            }

        case 3: // Intercept
            let items = Array(NetworkInterceptor.shared.pausedQueue.values)
            guard row < items.count else { return nil }
            let item = items[row].record
            switch col.identifier.rawValue {
            case "colStatus": cell.stringValue = "HELD"
            case "colMethod": cell.stringValue = item.method
            case "colHost": cell.stringValue = item.destination
            case "colPath": cell.stringValue = item.url.path
            default: break
            }

        case 4: // Firewall
            let rules = NetworkInterceptor.shared.rules
            guard row < rules.count else { return nil }
            let rule = rules[row]
            switch col.identifier.rawValue {
            case "colStatus": cell.stringValue = rule.enabled ? "ACTIVE" : "OFF"
            case "colMethod": cell.stringValue = "\(rule.hits) blkd"
            case "colHost": cell.stringValue = rule.pattern
            case "colPath": cell.stringValue = rule.label
            default: break
            }

        default:
            break
        }

        return cell
    }

    public func tableViewSelectionDidChange(_ notification: Notification) {
        let row = tableView.selectedRow
        guard row >= 0, row < NetworkInterceptor.shared.requests.count else { return }
        let record = NetworkInterceptor.shared.requests[row]
        inspectorView.inspect(record: record)
    }

    // --- Delegate Updates ---

    public func requestDidStart(_ record: RequestRecord) {
        updateTicker()
        tableView.reloadData()
    }

    public func requestDidUpdate(_ record: RequestRecord) {
        tableView.reloadData()
    }

    public func requestDidFinish(_ record: RequestRecord) {
        updateTicker()
        tableView.reloadData()
    }

    public func pausedRequestsDidChange(_ count: Int) {
        updateTicker()
        tableView.reloadData()
    }
}
