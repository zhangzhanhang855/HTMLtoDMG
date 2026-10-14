import Cocoa
import WebKit

@main
class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ aNotification: Notification) {
        let windowRect = NSRect(x: 0, y: 0, width: 900, height: 600)
        window = NSWindow(
            contentRect: windowRect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.title = "JRmusic"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden

        let configuration = WKWebViewConfiguration()
        configuration.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")

        webView = WKWebView(frame: windowRect, configuration: configuration)
        webView.navigationDelegate = self
        webView.autoresizingMask = [.width, .height]
        window.contentView = webView

        // Load bundled index.html from www folder
        if let htmlPath = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Resources/www") {
            webView.loadFileURL(htmlPath, allowingReadAccessTo: htmlPath.deletingLastPathComponent())
        } else if let altPath = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") {
            webView.loadFileURL(altPath, allowingReadAccessTo: altPath.deletingLastPathComponent())
        }

        window.makeKeyAndOrderFront(nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}
