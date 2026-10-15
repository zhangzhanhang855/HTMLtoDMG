import Cocoa
import WebKit

@main
class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
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
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.minSize = NSSize(width: 900, height: 600)

        // WebKit Preferences
        let preferences = WKPreferences()
        preferences.setValue(true, forKey: "developerExtrasEnabled") // Allows right-click Inspect Element

        let webConfiguration = WKWebViewConfiguration()
        webConfiguration.preferences = preferences
        webConfiguration.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        webConfiguration.setValue(true, forKey: "allowUniversalAccessFromFileURLs")

        // Initialize webView matching window bounds
        webView = WKWebView(frame: window.contentView!.bounds, configuration: webConfiguration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.autoresizingMask = [.width, .height]
        
        // Prevent white flash / black letterboxing
        webView.setValue(false, forKey: "drawsBackground")

        window.contentView?.addSubview(webView)

        // Load bundled index.html
        loadIndexHTML()

        window.makeKeyAndOrderFront(nil)
    }

    private func loadIndexHTML() {
        if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Resources/www") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            print("Failed to locate index.html inside application bundle")
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}
