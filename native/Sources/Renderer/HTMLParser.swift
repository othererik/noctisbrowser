import Foundation

public class HTMLNode {
    public let tag: String
    public var attributes: [String: String]
    public var children: [HTMLNode]
    public var text: String?
    public weak var parent: HTMLNode?

    public init(tag: String, attributes: [String: String] = [:], text: String? = nil) {
        self.tag = tag.lowercased()
        self.attributes = attributes
        self.children = []
        self.text = text
    }

    public func appendChild(_ child: HTMLNode) {
        child.parent = self
        children.append(child)
    }

    public var isBlock: Bool {
        return ["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "pre", "blockquote", "hr", "header", "section", "article", "footer", "table", "tr", "td", "th"].contains(tag)
    }
}

public class HTMLDocument {
    public var title: String = "Untitled Page"
    public var scripts: [String] = []
    public var styles: [String] = []
    public var root: HTMLNode = HTMLNode(tag: "body")
}

public class HTMLParser {
    private static let voidTags: Set<String> = [
        "img", "br", "hr", "input", "meta", "link",
        "source", "track", "param", "area", "base", "col", "embed", "wbr"
    ]

    public static func parse(html: String) -> HTMLDocument {
        let doc = HTMLDocument()
        let root = HTMLNode(tag: "body")
        doc.root = root

        var currentParent: HTMLNode = root
        var content = html

        // Remove XML declaration or doctype
        if let doctypeRange = content.range(of: "<!DOCTYPE[^>]*>", options: [.regularExpression, .caseInsensitive]) {
            content.removeSubrange(doctypeRange)
        }

        var i = content.startIndex

        while i < content.endIndex {
            let loopStart = i

            // 1. Check for HTML comments: <!-- ... -->
            if content[i...].hasPrefix("<!--") {
                if let commentEnd = content[i...].range(of: "-->") {
                    i = commentEnd.upperBound
                } else {
                    i = content.endIndex
                }
                continue
            }

            if content[i] == "<" {
                // Find tag close >
                guard let tagEnd = content[i...].firstIndex(of: ">") else {
                    break
                }

                let tagSlice = content[content.index(after: i)..<tagEnd].trimmingCharacters(in: .whitespacesAndNewlines)
                i = content.index(after: tagEnd)

                if tagSlice.hasPrefix("/") {
                    // Closing tag (e.g. </div>)
                    let closeTag = String(tagSlice.dropFirst()).trimmingCharacters(in: .whitespaces).lowercased()
                    // Ascend tree until matching parent tag or root
                    var search = currentParent
                    while let p = search.parent {
                        if search.tag == closeTag {
                            currentParent = p
                            break
                        }
                        search = p
                    }
                    continue
                }

                // Parse tag name and attributes
                let (tagName, attributes) = parseTagSlice(tagSlice)
                guard !tagName.isEmpty else { continue }

                // Check self-closing syntax (e.g. <script ... /> or <div />)
                let isSelfClosing = tagSlice.hasSuffix("/")

                // Handle special non-rendered tags: script, style, title
                if tagName == "script" {
                    if !isSelfClosing {
                        if let scriptEnd = content[i...].range(of: "</script>", options: .caseInsensitive) {
                            let scriptCode = String(content[i..<scriptEnd.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
                            let isJson = attributes["type"]?.lowercased().contains("json") ?? false
                            if !isJson && !scriptCode.isEmpty {
                                doc.scripts.append(scriptCode)
                            }
                            i = scriptEnd.upperBound
                        } else {
                            i = content.endIndex
                        }
                    }
                    continue
                }

                if tagName == "style" {
                    if !isSelfClosing {
                        if let styleEnd = content[i...].range(of: "</style>", options: .caseInsensitive) {
                            let styleCss = String(content[i..<styleEnd.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
                            doc.styles.append(styleCss)
                            i = styleEnd.upperBound
                        } else {
                            i = content.endIndex
                        }
                    }
                    continue
                }

                if tagName == "title" {
                    if !isSelfClosing {
                        if let titleEnd = content[i...].range(of: "</title>", options: .caseInsensitive) {
                            let pageTitle = String(content[i..<titleEnd.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
                            doc.title = decodeEntities(pageTitle)
                            i = titleEnd.upperBound
                        } else {
                            i = content.endIndex
                        }
                    }
                    continue
                }

                let node = HTMLNode(tag: tagName, attributes: attributes)
                currentParent.appendChild(node)

                if !voidTags.contains(tagName) && !isSelfClosing {
                    currentParent = node
                }

            } else {
                // Text node
                let nextTag = content[i...].firstIndex(of: "<") ?? content.endIndex
                let rawText = String(content[i..<nextTag])
                i = nextTag

                let cleanedText = decodeEntities(rawText.trimmingCharacters(in: .whitespacesAndNewlines))
                if !cleanedText.isEmpty {
                    let textNode = HTMLNode(tag: "#text", text: cleanedText)
                    currentParent.appendChild(textNode)
                }
            }

            // Guaranteed forward progress guard against infinite loops
            if i <= loopStart {
                i = content.index(after: loopStart)
            }
        }

        return doc
    }

    private static func parseTagSlice(_ slice: String) -> (String, [String: String]) {
        var cleanSlice = slice
        if cleanSlice.hasSuffix("/") {
            cleanSlice = String(cleanSlice.dropLast()).trimmingCharacters(in: .whitespaces)
        }

        var tagName = ""
        var attributes: [String: String] = [:]

        // Separate tag name from attributes
        var scanner = cleanSlice.startIndex
        while scanner < cleanSlice.endIndex && !cleanSlice[scanner].isWhitespace {
            scanner = cleanSlice.index(after: scanner)
        }
        tagName = String(cleanSlice[..<scanner]).lowercased()

        let attrString = String(cleanSlice[scanner...]).trimmingCharacters(in: .whitespaces)
        if !attrString.isEmpty {
            // Regex to extract key="val", key='val', or key=val
            let pattern = "([a-zA-Z0-9_:-]+)(?:\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+)))?"
            if let regex = try? NSRegularExpression(pattern: pattern, options: []) {
                let nsStr = attrString as NSString
                let matches = regex.matches(in: attrString, options: [], range: NSRange(location: 0, length: nsStr.length))
                for match in matches {
                    let keyRange = match.range(at: 1)
                    if keyRange.location != NSNotFound {
                        let key = nsStr.substring(with: keyRange).lowercased()
                        var val = ""
                        for idx in [2, 3, 4] {
                            if idx < match.numberOfRanges {
                                let valRange = match.range(at: idx)
                                if valRange.location != NSNotFound {
                                    val = nsStr.substring(with: valRange)
                                    break
                                }
                            }
                        }
                        attributes[key] = val
                    }
                }
            }
        }

        return (tagName, attributes)
    }

    private static func decodeEntities(_ str: String) -> String {
        return str
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&apos;", with: "'")
            .replacingOccurrences(of: "&#x27;", with: "'")
            .replacingOccurrences(of: "&#x2F;", with: "/")
    }
}
