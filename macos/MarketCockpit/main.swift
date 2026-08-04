import Cocoa
import WebKit

let DEFAULT_URL = "http://localhost:3000"
let URL_KEY = "server_url"

// MARK: - App Delegate
class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var errorView: NSView?
    var settingsWC: NSWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let url = UserDefaults.standard.string(forKey: URL_KEY) ?? DEFAULT_URL

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1400, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false)
        window.title = ""
        window.center()
        window.minSize = NSSize(width: 1024, height: 700)
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = NSColor(red: 7/255, green: 11/255, blue: 18/255, alpha: 1)
        window.titlebarAppearsTransparent = true

        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        window.contentView = webView

        loadURL(url)
        window.makeKeyAndOrderFront(nil)
        buildMenu()
    }

    func loadURL(_ server: String) {
        errorView?.removeFromSuperview()
        errorView = nil
        guard let u = URL(string: "\(server)/?desktop=1") else { return }
        webView.load(URLRequest(url: u, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 15))
    }

    func showError(_ server: String) {
        let v = NSView(frame: webView.bounds)
        v.autoresizingMask = [.width, .height]
        v.wantsLayer = true
        v.layer?.backgroundColor = NSColor(red: 7/255, green: 11/255, blue: 18/255, alpha: 1).cgColor

        let icon = NSTextField(labelWithString: "\u{1F4E1}")
        icon.font = NSFont.systemFont(ofSize: 48)
        icon.frame = NSRect(x: 0, y: 240, width: v.bounds.width, height: 60)
        icon.alignment = .center

        let title = NSTextField(labelWithString: "无法连接服务器")
        title.font = NSFont.boldSystemFont(ofSize: 18)
        title.textColor = NSColor(red: 226/255, green: 232/255, blue: 240/255, alpha: 1)
        title.frame = NSRect(x: 0, y: 200, width: v.bounds.width, height: 30)
        title.alignment = .center

        let desc = NSTextField(labelWithString: "\(server)\n请确认服务器可访问，或修改地址后重试。")
        desc.font = NSFont.systemFont(ofSize: 13)
        desc.textColor = NSColor(red: 148/255, green: 163/255, blue: 184/255, alpha: 1)
        desc.frame = NSRect(x: 0, y: 155, width: v.bounds.width, height: 36)
        desc.alignment = .center

        let retryBtn = NSButton(title: "重试", target: self, action: #selector(retryLoad))
        retryBtn.frame = NSRect(x: v.bounds.width/2 - 90, y: 110, width: 80, height: 28)
        retryBtn.bezelStyle = .rounded
        retryBtn.contentTintColor = NSColor(red: 34/255, green: 211/255, blue: 238/255, alpha: 1)

        let settingsBtn = NSButton(title: "服务器设置", target: self, action: #selector(openSettings))
        settingsBtn.frame = NSRect(x: v.bounds.width/2 + 10, y: 110, width: 80, height: 28)
        settingsBtn.bezelStyle = .rounded

        v.addSubview(icon); v.addSubview(title); v.addSubview(desc)
        v.addSubview(retryBtn); v.addSubview(settingsBtn)
        webView.addSubview(v)
        errorView = v
    }

    @objc func retryLoad() {
        loadURL(UserDefaults.standard.string(forKey: URL_KEY) ?? DEFAULT_URL)
    }

    @objc func openSettings() {
        let wc = SettingsWindowController()
        wc.onSave = { [weak self] url in
            UserDefaults.standard.set(url, forKey: URL_KEY)
            self?.loadURL(url)
        }
        wc.showWindow(nil)
        wc.window?.center()
        settingsWC = wc
    }

    // MARK: - Menu
    func buildMenu() {
        let mainMenu = NSMenu()
        let d = self as AnyObject // target

        // App
        let appMenu = NSMenu()
        appMenu.addItem(NSMenuItem(title: "关于市场研究驾驶舱", action: nil, keyEquivalent: ""))
        appMenu.addItem(NSMenuItem.separator())
        let appSettings = NSMenuItem(title: "服务器设置…", action: #selector(openSettings), keyEquivalent: ","); appSettings.target = d as? AnyObject
        appMenu.addItem(appSettings)
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(NSMenuItem(title: "退出", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        let appItem = NSMenuItem(); appItem.submenu = appMenu; mainMenu.addItem(appItem)

        // File
        let fileMenu = NSMenu(title: "文件")
        let fs = NSMenuItem(title: "服务器设置…", action: #selector(openSettings), keyEquivalent: ","); fs.target = d as? AnyObject
        fileMenu.addItem(fs)
        fileMenu.addItem(NSMenuItem.separator())
        let fr = NSMenuItem(title: "重新加载", action: #selector(retryLoad), keyEquivalent: "r"); fr.target = d as? AnyObject
        fileMenu.addItem(fr)
        let fi = NSMenuItem(title: "文件", action: nil, keyEquivalent: ""); fi.submenu = fileMenu; mainMenu.addItem(fi)

        // View
        let viewMenu = NSMenu(title: "显示")
        let vr = NSMenuItem(title: "重新加载", action: #selector(retryLoad), keyEquivalent: "r"); vr.target = d as? AnyObject
        viewMenu.addItem(vr)
        viewMenu.addItem(NSMenuItem.separator())
        viewMenu.addItem(NSMenuItem(title: "进入全屏幕", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f"))
        let vi = NSMenuItem(title: "显示", action: nil, keyEquivalent: ""); vi.submenu = viewMenu; mainMenu.addItem(vi)

        // Window
        let windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(NSMenuItem(title: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"))
        windowMenu.addItem(NSMenuItem(title: "缩放", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: ""))
        let wi = NSMenuItem(title: "窗口", action: nil, keyEquivalent: ""); wi.submenu = windowMenu; mainMenu.addItem(wi)

        NSApplication.shared.mainMenu = mainMenu
    }
}

// MARK: - WK Navigation
extension AppDelegate: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showError(UserDefaults.standard.string(forKey: URL_KEY) ?? DEFAULT_URL)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        errorView?.removeFromSuperview(); errorView = nil
    }
}

// MARK: - WK UI
extension AppDelegate: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            NSWorkspace.shared.open(url)
        }
        return nil
    }
}

// MARK: - Settings Window
class SettingsWindowController: NSWindowController {
    var onSave: ((String) -> Void)?
    private var urlField: NSTextField!
    private var localRadio: NSButton!
    private var remoteRadio: NSButton!

    convenience init() {
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 460, height: 240), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        w.title = "服务器设置"
        w.appearance = NSAppearance(named: .darkAqua)
        w.isReleasedWhenClosed = false

        let content = NSView(frame: NSRect(x: 0, y: 0, width: 460, height: 240))

        let urlLabel = NSTextField(labelWithString: "服务器地址")
        urlLabel.font = NSFont.boldSystemFont(ofSize: 13)
        urlLabel.textColor = NSColor(red: 226/255, green: 232/255, blue: 240/255, alpha: 1)
        urlLabel.frame = NSRect(x: 20, y: 192, width: 420, height: 20)
        content.addSubview(urlLabel)

        let uf = NSTextField(frame: NSRect(x: 20, y: 156, width: 420, height: 28))
        uf.placeholderString = DEFAULT_URL
        uf.stringValue = UserDefaults.standard.string(forKey: URL_KEY) ?? DEFAULT_URL
        uf.bezelStyle = .roundedBezel
        uf.font = NSFont.systemFont(ofSize: 13)
        content.addSubview(uf)

        let localBtn = NSButton(radioButtonWithTitle: "本地模式 — localhost:3000", target: nil, action: nil)
        localBtn.frame = NSRect(x: 24, y: 112, width: 416, height: 20); localBtn.font = NSFont.systemFont(ofSize: 12)
        localBtn.state = (uf.stringValue.contains("localhost") || uf.stringValue.contains("127.0.0.1")) ? .on : .off
        content.addSubview(localBtn)

        let remoteBtn = NSButton(radioButtonWithTitle: "远程模式 — 部署服务器", target: nil, action: nil)
        remoteBtn.frame = NSRect(x: 24, y: 92, width: 416, height: 20); remoteBtn.font = NSFont.systemFont(ofSize: 12)
        remoteBtn.state = localBtn.state == .on ? .off : .on
        content.addSubview(remoteBtn)

        let hint = NSTextField(labelWithString: "本地: http://localhost:3000 (先运行 npm start)  |  远程: https://mrd.hermes.cc.cd")
        hint.font = NSFont.systemFont(ofSize: 11)
        hint.textColor = NSColor(red: 100/255, green: 116/255, blue: 139/255, alpha: 1)
        hint.frame = NSRect(x: 20, y: 72, width: 420, height: 16)
        content.addSubview(hint)

        let saveBtn = NSButton(title: "保存并重载", target: nil, action: nil)
        saveBtn.frame = NSRect(x: 340, y: 20, width: 100, height: 28)
        saveBtn.bezelStyle = .rounded
        saveBtn.contentTintColor = NSColor(red: 34/255, green: 211/255, blue: 238/255, alpha: 1)
        content.addSubview(saveBtn)

        let cancelBtn = NSButton(title: "取消", target: nil, action: nil)
        cancelBtn.frame = NSRect(x: 260, y: 20, width: 74, height: 28)
        cancelBtn.bezelStyle = .rounded
        content.addSubview(cancelBtn)

        w.contentView = content
        self.init(window: w)

        saveBtn.target = self; saveBtn.action = #selector(save)
        cancelBtn.target = self; cancelBtn.action = #selector(closeWindow)
        localBtn.target = self; localBtn.action = #selector(modeChanged)
        remoteBtn.target = self; remoteBtn.action = #selector(modeChanged)

        self.urlField = uf
        self.localRadio = localBtn
        self.remoteRadio = remoteBtn
    }

    @objc func modeChanged() {
        urlField.stringValue = localRadio.state == .on ? "http://localhost:3000" : "https://mrd.hermes.cc.cd"
    }

    @objc func save() {
        let url = urlField.stringValue.trimmingCharacters(in: .whitespaces)
        guard !url.isEmpty, url.hasPrefix("http") else {
            let alert = NSAlert()
            alert.messageText = "请输入有效的服务器地址"
            alert.informativeText = "地址需要以 http:// 或 https:// 开头"
            alert.runModal()
            return
        }
        UserDefaults.standard.set(url, forKey: URL_KEY)
        onSave?(url)
        window?.close()
    }

    @objc func closeWindow() { window?.close() }
}

// MARK: - Entry
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.activate(ignoringOtherApps: true)
app.run()
