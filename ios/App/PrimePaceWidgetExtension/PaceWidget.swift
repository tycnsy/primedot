import WidgetKit
import SwiftUI

struct PaceWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: PaceWidgetSnapshot?
}

struct PaceWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> PaceWidgetEntry {
        PaceWidgetEntry(
            date: Date(),
            snapshot: PaceWidgetSnapshot(
                version: 1,
                generatedAtISO: ISO8601DateFormatter().string(from: Date()),
                itemCount: 1,
                items: [
                    PaceWidgetItem(
                        projectId: "preview",
                        projectName: "Preview Project",
                        paceSeconds: 4200,
                        marginSeconds: 3600,
                        paceEndISO: ISO8601DateFormatter().string(from: Date()),
                        tone: "ahead"
                    )
                ]
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (PaceWidgetEntry) -> Void) {
        completion(PaceWidgetEntry(date: Date(), snapshot: loadPaceWidgetSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PaceWidgetEntry>) -> Void) {
        let now = Date()
        let entry = PaceWidgetEntry(date: now, snapshot: loadPaceWidgetSnapshot())
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: now) ?? now.addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct PaceWidgetRow: View {
    let item: PaceWidgetItem

    private var toneColor: Color {
        switch item.tone {
        case "behind":
            return .red
        case "tight":
            return .orange
        default:
            return .green
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(toneColor)
                .frame(width: 6, height: 6)
            Text(item.projectName)
                .lineLimit(1)
            Spacer(minLength: 4)
            Text(item.shortPaceText)
                .monospacedDigit()
                .foregroundStyle(toneColor)
        }
        .widgetURL(item.deepLinkURL)
    }
}

struct PaceWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PaceWidgetEntry

    var body: some View {
        if let snapshot = entry.snapshot, !snapshot.items.isEmpty {
            switch family {
            case .systemSmall:
                SmallWidgetView(item: snapshot.items[0])
            case .systemMedium:
                ListWidgetView(items: Array(snapshot.items.prefix(4)), title: "Top Pace")
            case .systemLarge:
                ListWidgetView(items: Array(snapshot.items.prefix(8)), title: "Top Pace")
            case .accessoryInline:
                AccessoryInlineView(item: snapshot.items[0])
            case .accessoryCircular:
                AccessoryCircularView(item: snapshot.items[0])
            case .accessoryRectangular:
                AccessoryRectangularView(item: snapshot.items[0])
            @unknown default:
                ListWidgetView(items: Array(snapshot.items.prefix(2)), title: "Pace")
            }
        } else {
            EmptyPaceWidgetView()
        }
    }
}

struct SmallWidgetView: View {
    let item: PaceWidgetItem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Pace")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(item.projectName)
                .font(.headline)
                .lineLimit(2)
            Text(item.shortPaceText)
                .font(.title3.weight(.semibold))
                .monospacedDigit()
            Text("Margin \(item.marginText)")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(item.deepLinkURL)
    }
}

struct ListWidgetView: View {
    let items: [PaceWidgetItem]
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            ForEach(items, id: \.projectId) { item in
                PaceWidgetRow(item: item)
            }
            Spacer(minLength: 0)
        }
    }
}

struct AccessoryInlineView: View {
    let item: PaceWidgetItem

    var body: some View {
        Text("\(item.projectName): \(item.shortPaceText)")
            .widgetURL(item.deepLinkURL)
    }
}

struct AccessoryCircularView: View {
    let item: PaceWidgetItem

    var body: some View {
        ZStack {
            Circle().stroke(Color.secondary.opacity(0.25), lineWidth: 3)
            Text(item.shortPaceText.replacingOccurrences(of: " ", with: ""))
                .font(.system(size: 8, weight: .semibold, design: .rounded))
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .monospacedDigit()
        }
        .widgetURL(item.deepLinkURL)
    }
}

struct AccessoryRectangularView: View {
    let item: PaceWidgetItem

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(item.projectName)
                .font(.caption)
                .lineLimit(1)
            Text(item.shortPaceText)
                .font(.headline)
                .monospacedDigit()
        }
        .widgetURL(item.deepLinkURL)
    }
}

struct EmptyPaceWidgetView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Pace")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("No pace data yet")
                .font(.headline)
            Text("Open prime. to refresh.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct PaceWidget: Widget {
    let kind: String = "PrimePaceWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PaceWidgetProvider()) { entry in
            if #available(iOSApplicationExtension 17.0, *) {
                PaceWidgetView(entry: entry)
                    .containerBackground(for: .widget) {
                        Color(.systemBackground)
                    }
            } else {
                PaceWidgetView(entry: entry)
                    .padding()
            }
        }
        .configurationDisplayName("Project Pace")
        .description("Shows up to 8 project pace cards from prime.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .systemLarge,
            .accessoryInline,
            .accessoryCircular,
            .accessoryRectangular,
        ])
    }
}
