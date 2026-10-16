import Cocoa

public class DocumentView: NSScrollView, NSTextViewDelegate {
    private var textView: NSTextView!
    public var onNavigate: ((URL) -> Void)?
    public var jsRuntime: QuickJSRuntime?

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupView()
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    private func setupView() {
        self.hasVerticalScroller = true
        self.hasHorizontalScroller = false
        self.autohidesScrollers = true
        self.drawsBackground = true
        self.backgroundColor = NSColor(calibratedRed: 0.05, green: 0.07, blue: 0.11, alpha: 1.0) // Modern dark

        textView = NSTextView(frame: self.bounds)
        textView.autoresizingMask = [.width]
        textView.isEditable = false
        textView.isSelectable = true
        textView.drawsBackground = true
        textView.backgroundColor = NSColor(calibratedRed: 0.05, green: 0.07, blue: 0.11, alpha: 1.0)
        textView.textColor = NSColor(calibratedRed: 0.95, green: 0.96, blue: 0.98, alpha: 1.0)
        textView.textContainerInset = NSSize(width: 32, height: 28)
        textView.delegate = self

        self.documentView = textView
    }

    public func loadHTML(html: String, baseURL: URL? = nil) {
        let doc = HTMLParser.parse(html: html)

        // Reset and instantiate QuickJS runtime for page
        jsRuntime = QuickJSRuntime()

        // Build rich attributed text from DOM
        let attributed = NSMutableAttributedString()
        renderNode(doc.root, into: attributed, baseURL: baseURL)

        textView.textStorage?.setAttributedString(attributed)

        // Execute page scripts via QuickJS!
        for script in doc.scripts {
            jsRuntime?.evaluate(script: script, filename: baseURL?.absoluteString ?? "<page>")
        }
    }

    private func renderNode(_ node: HTMLNode, into attrStr: NSMutableAttributedString, baseURL: URL?) {
        for child in node.children {
            if child.tag == "#text", let text = child.text {
                let formatted = formatTextNode(text, parentTag: node.tag, attributes: node.attributes, baseURL: baseURL)
                attrStr.append(formatted)
            } else {
                renderNode(child, into: attrStr, baseURL: baseURL)
                if child.isBlock {
                    attrStr.append(NSAttributedString(string: "\n\n"))
                }
            }
        }
    }

    private func formatTextNode(_ text: String, parentTag: String, attributes: [String: String], baseURL: URL?) -> NSAttributedString {
        var font: NSFont = NSFont.systemFont(ofSize: 14)
        var color: NSColor = NSColor(calibratedRed: 0.92, green: 0.94, blue: 0.97, alpha: 1.0)
        var isLink = false
        var linkTarget: URL? = nil

        switch parentTag {
        case "h1":
            font = NSFont.boldSystemFont(ofSize: 26)
            color = NSColor.white
        case "h2":
            font = NSFont.boldSystemFont(ofSize: 21)
            color = NSColor.white
        case "h3":
            font = NSFont.boldSystemFont(ofSize: 17)
            color = NSColor.white
        case "pre", "code":
            font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
            color = NSColor(calibratedRed: 0.45, green: 0.85, blue: 0.98, alpha: 1.0) // Cyan
        case "a":
            font = NSFont.systemFont(ofSize: 14, weight: .medium)
            color = NSColor(calibratedRed: 0.23, green: 0.60, blue: 0.96, alpha: 1.0) // Royal Blue link
            isLink = true
            if let href = attributes["href"] {
                linkTarget = URL(string: href, relativeTo: baseURL)
            }
        case "blockquote":
            font = NSFont.systemFont(ofSize: 14, weight: .light)
            color = NSColor(calibratedRed: 0.65, green: 0.72, blue: 0.82, alpha: 1.0)
        default:
            break
        }

        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.lineSpacing = 4

        var attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: paragraphStyle
        ]

        if isLink, let target = linkTarget {
            attrs[.link] = target
            attrs[.underlineStyle] = NSUnderlineStyle.single.rawValue
        }

        return NSAttributedString(string: text + " ", attributes: attrs)
    }

    // Handle link clicks natively!
    public func textView(_ textView: NSTextView, clickedOnLink link: Any, at charIndex: Int) -> Bool {
        if let url = link as? URL {
            onNavigate?(url)
            return true
        } else if let str = link as? String, let url = URL(string: str) {
            onNavigate?(url)
            return true
        }
        return false
    }
}
