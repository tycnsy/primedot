import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var didRegisterCustomPlugins = false
    private var registrationAttempt = 0

    private func findBridgeViewController(from root: UIViewController?) -> CAPBridgeViewController? {
        if let bridge = root as? CAPBridgeViewController {
            return bridge
        }
        if let nav = root as? UINavigationController {
            for controller in nav.viewControllers {
                if let bridge = findBridgeViewController(from: controller) {
                    return bridge
                }
            }
        }
        if let tab = root as? UITabBarController {
            for controller in tab.viewControllers ?? [] {
                if let bridge = findBridgeViewController(from: controller) {
                    return bridge
                }
            }
        }
        if let presented = root?.presentedViewController {
            return findBridgeViewController(from: presented)
        }
        return nil
    }

    private func activeRootViewController() -> UIViewController? {
        if let root = window?.rootViewController {
            return root
        }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        for scene in scenes {
            if let keyRoot = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController {
                return keyRoot
            }
            if let anyRoot = scene.windows.first?.rootViewController {
                return anyRoot
            }
        }
        return UIApplication.shared.windows.first(where: { $0.isKeyWindow })?.rootViewController
    }

    private func registerCustomPluginsIfNeeded() {
        if didRegisterCustomPlugins { return }
        guard let bridgeViewController = findBridgeViewController(from: activeRootViewController()),
              let bridge = bridgeViewController.bridge else {
            return
        }
        bridge.registerPluginType(PaceWidgetBridgePlugin.self)
        didRegisterCustomPlugins = true
    }

    private func scheduleRegistrationRetry() {
        if didRegisterCustomPlugins { return }
        if registrationAttempt >= 12 { return }
        registrationAttempt += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            guard let self = self else { return }
            self.registerCustomPluginsIfNeeded()
            self.scheduleRegistrationRetry()
        }
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        registerCustomPluginsIfNeeded()
        scheduleRegistrationRetry()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        registerCustomPluginsIfNeeded()
        scheduleRegistrationRetry()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        registerCustomPluginsIfNeeded()
        scheduleRegistrationRetry()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
