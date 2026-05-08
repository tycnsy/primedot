import Foundation
import Capacitor
import WidgetKit

@objc(PaceWidgetBridgePlugin)
public class PaceWidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PaceWidgetBridgePlugin"
    public let jsName = "PaceWidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updatePaceSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPaceSnapshotDebug", returnType: CAPPluginReturnPromise)
    ]

    private let appGroupIdentifier = "group.com.primedev.app"
    private let snapshotDefaultsKey = "prime.pace.widget.snapshot.v1"

    @objc func updatePaceSnapshot(_ call: CAPPluginCall) {
        guard let snapshot = call.getString("snapshot"), !snapshot.isEmpty else {
            call.resolve([
                "ok": false,
                "error": "Expected non-empty snapshot JSON string."
            ])
            return
        }

        let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
        guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
            call.resolve([
                "ok": false,
                "error": "Unable to open app group defaults.",
                "appGroupIdentifier": appGroupIdentifier,
                "containerAvailable": containerURL != nil
            ])
            return
        }

        defaults.set(snapshot, forKey: snapshotDefaultsKey)
        let synced = defaults.synchronize()
        WidgetCenter.shared.reloadAllTimelines()

        call.resolve([
            "ok": true,
            "bytes": snapshot.utf8.count,
            "synced": synced
        ])
    }

    @objc func getPaceSnapshotDebug(_ call: CAPPluginCall) {
        let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
        let defaults = UserDefaults(suiteName: appGroupIdentifier)
        let snapshot = defaults?.string(forKey: snapshotDefaultsKey) ?? ""

        var itemCount = 0
        if let data = snapshot.data(using: .utf8),
           let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let items = object["items"] as? [Any] {
            itemCount = items.count
        }

        call.resolve([
            "appGroupIdentifier": appGroupIdentifier,
            "defaultsAvailable": defaults != nil,
            "containerAvailable": containerURL != nil,
            "hasSnapshot": !snapshot.isEmpty,
            "snapshotBytes": snapshot.utf8.count,
            "itemCount": itemCount
        ])
    }
}
