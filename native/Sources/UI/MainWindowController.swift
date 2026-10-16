import Cocoa

public class MainWindowController: NSWindowController, NSTextFieldDelegate {
    private var addressField: NSTextField!
    private var backButton: NSButton!
    private var forwardButton: NSButton!
    private var reloadButton: NSButton!
    private var toggleCockpitButton: NSButton!

    private var splitView: NSSplitView!
    private var documentView: DocumentView!
    private var cockpitView: CockpitView!

    private var history: [URL] = []
    private var historyIndex: Int = -1

    public convenience init() {
        let window = NSWindow(
            contentRect: NSRect(x: 100, y: 100, width: 1400, height: 860),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "NetScope Native ⚡ (Zero-Trace / Non-WebKit)"
        window.backgroundColor = NSColor(calibratedRed: 0.05, green: 0.07, blue: 0.11, alpha: 1.0)
        self.init(window: window)
        setupUI()

        // Load starter page
        loadURL(URL(string: "https://news.ycombinator.com")!)
    }

    private func setupUI() {
        guard let window = window else { return }

        let contentView = NSView(frame: window.contentView!.bounds)
        contentView.autoresizingMask = [.width, .height]
        window.contentView = contentView

        // Top Navigation Toolbar
        let toolbarView = NSView()
        toolbarView.translatesAutoresizingMaskIntoConstraints = false
        toolbarView.wantsLayer = true
        toolbarView.layer?.backgroundColor = NSColor(calibratedRed: 0.08, green: 0.10, blue: 0.15, alpha: 1.0).cgColor
        contentView.addSubview(toolbarView)

        backButton = NSButton(title: "◀", target: self, action: #selector(backClicked))
        backButton.bezelStyle = .rounded
        backButton.translatesAutoresizingMaskIntoConstraints = false
        toolbarView.addSubview(backButton)

        forwardButton = NSButton(title: "▶", target: self, action: #selector(forwardClicked))
        forwardButton.bezelStyle = .rounded
        forwardButton.translatesAutoresizingMaskIntoConstraints = false
        toolbarView.addSubview(forwardButton)

        reloadButton = NSButton(title: "🔄", target: self, action: #selector(reloadClicked))
        reloadButton.bezelStyle = .rounded
        reloadButton.translatesAutoresizingMaskIntoConstraints = false
        toolbarView.addSubview(reloadButton)

        addressField = NSTextField()
        addressField.placeholderString = "Enter URL or search term..."
        addressField.font = NSFont.systemFont(ofSize: 13)
        addressField.textColor = NSColor.white
        addressField.backgroundColor = NSColor(calibratedRed: 0.04, green: 0.06, blue: 0.09, alpha: 1.0)
        addressField.focusRingType = .none
        addressField.delegate = self
        addressField.translatesAutoresizingMaskIntoConstraints = false
        toolbarView.addSubview(addressField)

        toggleCockpitButton = NSButton(title: "⚡ Cockpit", target: self, action: #selector(toggleCockpitClicked))
        toggleCockpitButton.bezelStyle = .rounded
        toggleCockpitButton.font = NSFont.boldSystemFont(ofSize: 11)
        toggleCockpitButton.translatesAutoresizingMaskIntoConstraints = false
        toolbarView.addSubview(toggleCockpitButton)

        // Split view (DocumentView on Left, CockpitView on Right)
        splitView = NSSplitView()
        splitView.isVertical = true
        splitView.dividerStyle = .thin
        splitView.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(splitView)

        documentView = DocumentView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        documentView.onNavigate = { [weak self] url in
            self?.loadURL(url)
        }
        splitView.addSubview(documentView)

        cockpitView = CockpitView(frame: NSRect(x: 0, y: 0, width: 600, height: 600))
        splitView.addSubview(cockpitView)

        splitView.setPosition(820, ofDividerAt: 0)

        NSLayoutConstraint.activate([
            toolbarView.topAnchor.constraint(equalTo: contentView.topAnchor),
            toolbarView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            toolbarView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            toolbarView.heightAnchor.constraint(equalToConstant: 44),

            backButton.leadingAnchor.constraint(equalTo: toolbarView.leadingAnchor, constant: 12),
            backButton.centerYAnchor.constraint(equalTo: toolbarView.centerYAnchor),
            backButton.widthAnchor.constraint(equalToConstant: 34),

            forwardButton.leadingAnchor.constraint(equalTo: backButton.trailingAnchor, constant: 4),
            forwardButton.centerYAnchor.constraint(equalTo: toolbarView.centerYAnchor),
            forwardButton.widthAnchor.constraint(equalToConstant: 34),

            reloadButton.leadingAnchor.constraint(equalTo: forwardButton.trailingAnchor, constant: 4),
            reloadButton.centerYAnchor.constraint(equalTo: toolbarView.centerYAnchor),
            reloadButton.widthAnchor.constraint(equalToConstant: 34),

            addressField.leadingAnchor.constraint(equalTo: reloadButton.trailingAnchor, constant: 10),
            addressField.centerYAnchor.constraint(equalTo: toolbarView.centerYAnchor),
            addressField.trailingAnchor.constraint(equalTo: toggleCockpitButton.leadingAnchor, constant: -10),
            addressField.heightAnchor.constraint(equalToConstant: 26),

            toggleCockpitButton.trailingAnchor.constraint(equalTo: toolbarView.trailingAnchor, constant: -12),
            toggleCockpitButton.centerYAnchor.constraint(equalTo: toolbarView.centerYAnchor),

            splitView.topAnchor.constraint(equalTo: toolbarView.bottomAnchor),
            splitView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            splitView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            splitView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor)
        ])
    }

    public func loadURL(_ url: URL) {
        addressField.stringValue = url.absoluteString
        self.window?.title = "NetScope Native - Loading \(url.host ?? "")..."

        let record = RequestRecord(
            url: url,
            method: "GET",
            source: "Document Loader",
            resourceType: "Document"
        )

        NetworkInterceptor.shared.execute(record: record) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if let data = data {
                    let html = String(data: data, encoding: .utf8) ?? String(decoding: data, as: UTF8.self)
                    self.documentView.loadHTML(html: html, baseURL: url)
                    self.updateHistory(url: url)
                    self.window?.title = "NetScope Native - \(url.host ?? url.absoluteString)"
                } else if let error = error {
                    let errHtml = "<h1>Page Failed to Load</h1><p>\(error.localizedDescription)</p>"
                    self.documentView.loadHTML(html: errHtml, baseURL: url)
                    self.window?.title = "NetScope Native - Error"
                }
            }
        }
    }

    private func updateHistory(url: URL) {
        if historyIndex < history.count - 1 {
            history = Array(history[0...historyIndex])
        }
        history.append(url)
        historyIndex = history.count - 1
        updateNavButtons()
    }

    private func updateNavButtons() {
        backButton.isEnabled = historyIndex > 0
        forwardButton.isEnabled = historyIndex < history.count - 1
    }

    @objc private func backClicked() {
        guard historyIndex > 0 else { return }
        historyIndex -= 1
        loadURL(history[historyIndex])
    }

    @objc private func forwardClicked() {
        guard historyIndex < history.count - 1 else { return }
        historyIndex += 1
        loadURL(history[historyIndex])
    }

    @objc private func reloadClicked() {
        guard historyIndex >= 0 && historyIndex < history.count else { return }
        loadURL(history[historyIndex])
    }

    @objc private func toggleCockpitClicked() {
        cockpitView.isHidden.toggle()
    }

    public func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        if commandSelector == #selector(NSResponder.insertNewline(_:)) {
            var input = addressField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            if !input.hasPrefix("http://") && !input.hasPrefix("https://") {
                if input.contains(".") {
                    input = "https://" + input
                } else {
                    input = "https://duckduckgo.com/html/?q=" + input.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!
                }
            }
            if let url = URL(string: input) {
                loadURL(url)
            }
            return true
        }
        return false
    }
}
