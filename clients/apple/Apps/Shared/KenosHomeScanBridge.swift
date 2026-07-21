import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Bridge from Kenos Domain Mode Home → companion `ios/home-scan` (HomeScan).
///
/// Architecture keeps RoomPlan/ARKit in the companion (not merged into Kenos shell).
/// Continuity reaches those capabilities via `homescan://` deep links.
enum KenosHomeScanBridge {
    static let scheme = "homescan"
    static let bundleId = "space.kenos.homescan"

    enum Destination: String, CaseIterable {
        case scan
        case find
        case container

        var url: URL {
            switch self {
            case .scan:
                return URL(string: "\(KenosHomeScanBridge.scheme)://scan")!
            case .find:
                return URL(string: "\(KenosHomeScanBridge.scheme)://find")!
            case .container:
                return URL(string: "\(KenosHomeScanBridge.scheme)://container")!
            }
        }

        var title: String {
            switch self {
            case .scan: return "全屋扫描"
            case .find: return "寻找物品"
            case .container: return "柜内扫描"
            }
        }
    }

    /// True when iOS can open the HomeScan URL scheme (companion installed).
    static var isInstalled: Bool {
        #if os(iOS)
        return UIApplication.shared.canOpenURL(Destination.scan.url)
        #else
        return false
        #endif
    }

    /// Open companion for RoomPlan / AR find / cabinet scan.
    /// - Returns: `true` if open was requested; `false` if companion missing / unsupported.
    @discardableResult
    static func open(_ destination: Destination) -> Bool {
        #if os(iOS)
        let url = destination.url
        guard UIApplication.shared.canOpenURL(url) else {
            KenosLog.warning(
                "HomeScan companion not installed",
                category: .shell,
                metadata: ["destination": destination.rawValue]
            )
            return false
        }
        UIApplication.shared.open(url)
        KenosLog.breadcrumb(
            "open HomeScan companion",
            category: .shell,
            metadata: ["destination": destination.rawValue]
        )
        return true
        #else
        return false
        #endif
    }

    /// Parse More-sheet path that targets the companion (`homescan://…`).
    static func destination(fromMorePath path: String) -> Destination? {
        let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              url.scheme?.lowercased() == scheme
        else { return nil }
        let host = (url.host ?? "").lowercased()
        switch host {
        case "scan", "": return .scan
        case "find", "locate": return .find
        case "container", "cabinet": return .container
        default: return nil
        }
    }
}
