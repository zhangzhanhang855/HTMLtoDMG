import Cocoa
import WebKit

@main
class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ aNotification: Notification) {
        let initialRect = NSRect(x: 0, y: 0, width: 1200, height: 800)

        window = NSWindow(
            contentRect: initialRect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.title = "JRmusic"
        window.minSize = NSSize(width: 900, height: 600)

        // WebKit Sandbox & Local Resource Security Bypass
        let config = WKWebViewConfiguration()
        let prefs = WKPreferences()
        prefs.setValue(true, forKey: "developerExtrasEnabled")
        config.preferences = prefs
        
        // Allow local file loading and cross-origin access within the bundle
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")

        // Bind frame directly to window content bounds
        let contentView = window.contentView!
        webView = WKWebView(frame: contentView.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        contentView.addSubview(webView)

        loadIndexHTML()
        window.makeKeyAndOrderFront(nil)
    }

    private func loadIndexHTML() {
        let fileManager = FileManager.default
        let bundlePath = Bundle.main.bundlePath
        
        // Array of possible paths where index.html could exist
        let candidatePaths = [
            Bundle.main.path(forResource: "index", ofType: "html", inDirectory: "www"),
            Bundle.main.path(forResource: "index", ofType: "html"),
            "\(bundlePath)/Contents/Resources/www/index.html",
            "\(bundlePath)/Contents/Resources/index.html"
        ].compactMap { $0 }

        for path in candidatePaths {
            if fileManager.fileExists(atPath: path) {
                let fileURL = URL(fileURLWithPath: path)
                let accessDirectory = fileURL.deletingLastPathComponent()
                // Grant WebKit permission to read all sibling files (style.css, app.js)
                webView.loadFileURL(fileURL, allowingReadAccessTo: accessDirectory)
                print("Successfully loaded: \(path)")
                return
            }
        }

        // Visual fallback alert inside the window if files are missing
        let errorHTML = """
        <html><body style='background:#111;color:#ff5555;font-family:sans-serif;padding:40px;'>
        <h2>JRmusic: HTML File Not Found</h2>
        <p>Searched paths:</p>
        <pre>\(candidatePaths.joined(separator: "\n"))</pre>
        </body></html>
        """
        webView.loadHTMLString(errorHTML, baseURL: nil)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("WebKit Navigation Error: \(error.localizedDescription)")
    }
}
