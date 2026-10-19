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

        // WebKit 核心配置
        let webConfiguration = WKWebViewConfiguration()
        let preferences = WKPreferences()
        preferences.setValue(true, forKey: "developerExtrasEnabled") // 允許右鍵檢查元素
        webConfiguration.preferences = preferences

        // 徹底解除本地 HTML / CSS / JS 與 CORS 跨域限制
        webConfiguration.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        webConfiguration.setValue(true, forKey: "allowUniversalAccessFromFileURLs")

        webView = WKWebView(frame: window.contentView!.bounds, configuration: webConfiguration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground") // 避免白屏閃爍

        window.contentView?.addSubview(webView)

        loadIndexHTML()
        window.makeKeyAndOrderFront(nil)
    }

    private func loadIndexHTML() {
        let fileManager = FileManager.default
        let bundleResourcePath = Bundle.main.resourcePath ?? ""
        
        // 窮舉所有可能的實際物理路徑
        let candidates = [
            "\(bundleResourcePath)/www/index.html",
            "\(bundleResourcePath)/index.html",
            Bundle.main.path(forResource: "index", ofType: "html", inDirectory: "www") ?? "",
            Bundle.main.path(forResource: "index", ofType: "html") ?? ""
        ].filter { !$0.isEmpty }

        for path in candidates {
            if fileManager.fileExists(atPath: path) {
                let fileURL = URL(fileURLWithPath: path)
                // 授權 WebKit 讀取該目錄下所有相鄰檔案 (style.css, app.js 等)
                let accessDir = fileURL.deletingLastPathComponent()
                webView.loadFileURL(fileURL, allowingReadAccessTo: accessDir)
                NSLog("[JRmusic] Successfully loaded HTML from: %@", path)
                return
            }
        }

        // 如果真的任何路徑都找不到，在視窗中直觀印出診斷資訊，不再默默黑屏
        let debugHTML = """
        <!DOCTYPE html>
        <html>
        <body style="background:#0a0d14;color:#f87171;font-family:-apple-system,sans-serif;padding:40px;">
          <h2>❌ JRmusic 資源載入失敗</h2>
          <p style="color:#94a3b8;">找不到 index.html，請檢查 App 內部封裝結構。已檢查過的路徑：</p>
          <pre style="background:#1e293b;color:#38bdf8;padding:16px;border-radius:8px;overflow-x:auto;">\(candidates.joined(separator: "\n"))</pre>
          <p style="color:#64748b;font-size:12px;">App Bundle Path: \(Bundle.main.bundlePath)</p>
        </body>
        </html>
        """
        webView.loadHTMLString(debugHTML, baseURL: nil)
    }

    // 導航失敗回呼
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("[JRmusic] Navigation failed: %@", error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("[JRmusic] Provisional navigation failed: %@", error.localizedDescription)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}
