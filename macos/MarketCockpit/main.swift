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
        let saved = UserDefaults.standard.string(forKey: URL_KEY) ?? DEFAULT_URL

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

        // WKWebView config
        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        window.contentView = webView

        loadURL(saved)
        window.makeKeyAndOrderFront(nil)
        buildMenu()
    }

    func loadURL(_ urlString: String) {
        errorView?.removeFromSuperview()
        errorView = nil
        guard let url = URL(string: "\(urlString)/?desktop=1") else { return }
        webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 15))
    }

    func showError(_ urlString: String) {
        let v = NSView(frame: webView.bounds)
        v.autoresizingMask = [.width, .height]
        v.wantsLayer = true
        v.layer?.backgroundColor = NSColor(red: 7/255, green: 11/255, blue: 18/255, alpha: 1).cgColor

        let icon = NSTextField(labelWithString: "📡")
        icon.font = NSFont.systemFont(ofSize: 48)
        icon.frame = NSRect(x: 0, y: 240, width: v.bounds.width, height: 60)
        icon.alignment = .center

        let title = NSTextField(labelWithString: "无法连接服务器")
        title.font = NSFont.boldSystemFont(ofSize: 18)
        title.textColor = NSColor(red: 226/255, green: 232/255, blue: 240/255, alpha: 1)
        title.frame = NSRect(x: 0, y: 200, width: v.bounds.width, height: 30)
        title.alignment = .center

        let desc = NSTextField(labelWithString: "请确认服务器可访问，或修改服务器地址后重试。")
        desc.font = NSFont.systemFont(ofSize: 13)
        desc.textColor = NSColor(red: 148/255, green: 163/255, blue: 184/255, alpha: 1)
        desc.frame = NSRect(x: 0, y: 172, width: v.bounds.width, height: 20)
        desc.alignment = .center

        let retryBtn = NSButton(title: "重试", target: self, action: #selector(retryLoad))
        retryBtn.frame = NSRect(x: v.bounds.width/2 - 90, y: 120, width: 80, height: 28)
        retryBtn.bezelStyle = .rounded
        retryBtn.contentTintColor = NSColor(red: 34/255, green: 211/255, blue: 238/255, alpha: 1)

        let settingsBtn = NSButton(title: "服务器设置", target: self, action: #selector(openSettings))
        settingsBtn.frame = NSRect(x: v.bounds.width/2 + 10, y: 120, width: 80, height: 28)
        settingsBtn.bezelStyle = .rounded

        v.addSubview(icon)
        v.addSubview(title)
        v.addSubview(desc)
        v.addSubview(retryBtn)
        v.addSubview(settingsBtn)

        webView.addSubview(v)
        errorView = v
    }

    @objc func retryLoad() {
        let url = UserDefaults.standard.string(forKey: URL_KEY) ?? DEFAULT_URL
        loadURL(url)
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

        // App menu
        let appMenu = NSMenu()
        appMenu.addItem(NSMenuItem(title: "关于市场研究驾驶舱", action: nil, keyEquivalent: ""))
        appMenu.addItem(NSMenuItem.separator())
        let settingsItem = NSMenuItem(title: "服务器设置…", action: #selector(openSettings), keyEquivalent: ",")
        appMenu.addItem(settingsItem)
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(NSMenuItem(title: "退出", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        let appMenuItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // File
        let fileMenu = NSMenu(title: "文件")
        fileMenu.addItem(NSMenuItem(title: "服务器设置…", action: #selector(openSettings), keyEquivalent: ","))
        fileMenu.addItem(NSMenuItem.separator())
        fileMenu.addItem(NSMenuItem(title: "重新加载", action: #selector(retryLoad), keyEquivalent: "r"))
        let fileItem = NSMenuItem(title: "文件", action: nil, keyEquivalent: "")
        fileItem.submenu = fileMenu
        mainMenu.addItem(fileItem)

        // View
        let viewMenu = NSMenu(title: "显示")
        viewMenu.addItem(NSMenuItem(title: "重新加载", action: #selector(retryLoad), keyEquivalent: "r"))
        viewMenu.addItem(NSMenuItem.separator())
        viewMenu.addItem(NSMenuItem(title: "进入全屏幕", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f"))
        let viewItem = NSMenuItem(title: "显示", action: nil, keyEquivalent: "")
        viewItem.submenu = viewMenu
        mainMenu.addItem(viewItem)

        // Window
        let windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(NSMenuItem(title: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"))
        windowMenu.addItem(NSMenuItem(title: "缩放", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: ""))
        let windowItem = NSMenuItem(title: "窗口", action: nil, keyEquivalent: "")
        windowItem.submenu = windowMenu
        mainMenu.addItem(windowItem)

        NSApplication.shared.mainMenu = mainMenu
    }
}

// MARK: - WK Navigation Delegate
extension AppDelegate: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let url = UserDefaults.standard.string(forKey: URL_KEY) ?? DEFAULT_URL
        showError(url)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        errorView?.removeFromSuperview()
        errorView = nil
    }
}

// MARK: - WK UI Delegate
extension AppDelegate: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // Open external links in system browser
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            NSWorkspace.shared.open(url)
        }
        return nil
    }
}

// MARK: - Settings Window
class SettingsWindowController: NSWindowController {

    var onSave: ((String) -> Void)?

    convenience init() {
        let w = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 460, height: 280),
            styleMask: [.titled, .closable],
            backing: .buffered, defer: false)
        w.title = "服务器设置"
        w.appearance = NSAppearance(named: .darkAqua)
        w.isReleasedWhenClosed = false

        // Content
        let content = NSView(frame: NSRect(x: 0, y: 0, width: 460, height: 280))

        let modeLabel = NSTextField(labelWithString: "运行模式")
        modeLabel.font = NSFont.boldSystemFont(ofSize: 13)
        modeLabel.textColor = NSColor(red: 226/255, green: 232/255, blue: 240/255, alpha: 1)
        modeLabel.frame = NSRect(x: 20, y: 236, width: 420, height: 20)
        content.addSubview(modeLabel)

        let localRadio = NSButton(radioButtonWithTitle: "本地模式 — 连接本地 npm start 服务器 (localhost:3000)", target: nil, action: nil)
        localRadio.frame = NSRect(x: 24, y: 212, width: 416, height: 20)
        localRadio.font = NSFont.systemFont(ofSize: 12)
        localRadio.state = .on
        content.addSubview(localRadio)

        let remoteRadio = NSButton(radioButtonWithTitle: "远程模式 — 连接部署服务器 (https://mrd.hermes.cc.cd)", target: nil, action: nil)
        remoteRadio.frame = NSRect(x: 24, y: 192, width: 416, height: 20)
        remoteRadio.font = NSFont.systemFont(ofSize: 12)
        content.addSubview(remoteRadio)

        // Group the radios
        // ... simplified: just use URL text field

        let urlLabel = NSTextField(labelWithString: "服务器地址")
        urlLabel.font = NSFont.boldSystemFont(ofSize: 13)
        urlLabel.textColor = NSColor(red: 226/255, green: 232/255, blue: 240/255, alpha: 1)
        urlLabel.frame = NSRect(x: 20, y: 160, width: 420, height: 20)
        content.addSubview(urlLabel)

        let urlField = NSTextField(frame: NSRect(x: 20, y: 124, width: 420, height: 28))
        urlField.placeholderString = DEFAULT_URL
        urlField.stringValue = UserDefaults.standard.string(forKey: URL_KEY) ?? DEFAULT_URL
        urlField.bezelStyle = .roundedBezel
        urlField.font = NSFont.systemFont(ofSize: 13)
        content.addSubview(urlField)

        let hint = NSTextField(labelWithString: "本地开发默认 http://localhost:3000（先运行 npm start）")
        hint.font = NSFont.systemFont(ofSize: 11)
        hint.textColor = NSColor(red: 100/255, green: 116/255, blue: 139/255, alpha: 1)
        hint.frame = NSRect(x: 20, y: 108, width: 420, height: 16)
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

        // After init: set self-referencing properties
        saveBtn.target = self
        saveBtn.action = #selector(save)
        cancelBtn.target = self
        cancelBtn.action = #selector(close)
        localRadio.target = self
        localRadio.action = #selector(modeChanged)
        remoteRadio.target = self
        remoteRadio.action = #selector(modeChanged)

        // Store refs
        self.urlField = urlField
        self.localRadio = localRadio
        self.remoteRadio = remoteRadio
        localRadio.target = self
        localRadio.action = #selector(modeChanged)
        remoteRadio.target = self
        remoteRadio.action = #selector(modeChanged)
    }

    var urlField: NSTextField!
    var localRadio: NSButton!
    var remoteRadio: NSButton!

    @objc func modeChanged() {
        if localRadio.state == .on {
            urlField.stringValue = "http://localhost:3000"
        } else {
            urlField.stringValue = "https://mrd.hermes.cc.cd"
        }
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
        onSave?(url)
        close()
    }

    override func close() {
        window?.close()
    }
}

// MARK: - Entry
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.activate(ignoringOtherApps: true)
app.run()
