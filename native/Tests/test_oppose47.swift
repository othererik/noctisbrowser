import Foundation

@main
struct OpposeTest {
    static func main() {
        print("Testing oppose47.html parsing...")
        guard let data = FileManager.default.contents(atPath: "native/build/oppose47.html"),
              let html = String(data: data, encoding: .utf8) else {
            print("Failed to read oppose47.html")
            return
        }
        print("Read \(html.count) characters of HTML. Starting parse...")
        let start = Date()
        let doc = HTMLParser.parse(html: html)
        let elapsed = Date().timeIntervalSince(start)
        print("Parsed successfully in \(elapsed) seconds!")
        print("Title: \(doc.title)")
        print("Scripts extracted: \(doc.scripts.count)")
        print("Styles extracted: \(doc.styles.count)")
    }
}
