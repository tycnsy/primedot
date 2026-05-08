import Foundation

enum PaceWidgetStore {
    static let appGroupIdentifier = "group.com.primedev.app"
    static let snapshotDefaultsKey = "prime.pace.widget.snapshot.v1"
}

struct PaceWidgetSnapshot: Decodable {
    let version: Int
    let generatedAtISO: String
    let itemCount: Int
    let items: [PaceWidgetItem]
}

struct PaceWidgetItem: Decodable, Hashable {
    let projectId: String
    let projectName: String
    let paceSeconds: Int
    let marginSeconds: Int
    let paceEndISO: String
    let tone: String

    var deepLinkURL: URL? {
        URL(string: "com.prime.app://projects/pace")
    }

    var shortPaceText: String {
        formatSignedDuration(seconds: paceSeconds)
    }

    var marginText: String {
        formatSignedDuration(seconds: marginSeconds)
    }
}

func loadPaceWidgetSnapshot() -> PaceWidgetSnapshot? {
    guard let defaults = UserDefaults(suiteName: PaceWidgetStore.appGroupIdentifier),
          let snapshotJSON = defaults.string(forKey: PaceWidgetStore.snapshotDefaultsKey),
          let snapshotData = snapshotJSON.data(using: .utf8) else {
        return nil
    }

    return try? JSONDecoder().decode(PaceWidgetSnapshot.self, from: snapshotData)
}

func formatSignedDuration(seconds: Int) -> String {
    let sign = seconds < 0 ? "-" : "+"
    let absSeconds = abs(seconds)
    let hours = absSeconds / 3600
    let minutes = (absSeconds % 3600) / 60
    if hours > 0 {
        return String(format: "%@%02dh %02dm", sign, hours, minutes)
    }
    return String(format: "%@%02dm", sign, minutes)
}
