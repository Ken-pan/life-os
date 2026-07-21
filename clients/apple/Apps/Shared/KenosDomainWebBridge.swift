#if os(iOS)
import WebKit

/// Bridge Domain Continuity WKWebView ↔ leave-guard / compose JS APIs.
@MainActor
enum KenosDomainWebBridge {
    struct LeaveProbe: Equatable {
        var dirty: Bool
        var summary: String
    }

    weak static var activeWebView: WKWebView?

    /// Last Navigation Manifest published by web (or empty).
    static var navManifest: KenosNativeCapabilityBridge.NavManifest {
        KenosNativeCapabilityBridge.lastNavManifest
    }

    static func probeLeave(completion: @escaping (LeaveProbe) -> Void) {
        KenosLog.debug("leave probe", category: .bridge)
        guard let webView = activeWebView else {
            KenosLog.debug("leave probe skipped — no webView", category: .bridge)
            // Fall back to last published manifest draft flag.
            let m = KenosNativeCapabilityBridge.lastNavManifest
            completion(LeaveProbe(dirty: m.unsavedDraft, summary: m.summary))
            return
        }
        // Never stall Space switch forever if the web content process is busy.
        final class ProbeGate {
            var settled = false
        }
        let gate = ProbeGate()
        let finishOnMain: (LeaveProbe) -> Void = { probe in
            Task { @MainActor in
                guard !gate.settled else { return }
                gate.settled = true
                completion(probe)
            }
        }
        let js = """
        (function(){
          try {
            var g = window.__KENOS_LEAVE_GUARD__;
            var m = window.__KENOS_NAV_MANIFEST__ || {};
            var dirty = false;
            var summary = '';
            if (g && typeof g.probe === 'function') {
              var r = g.probe() || {};
              dirty = !!r.dirty;
              summary = String(r.summary||'');
            }
            if (!dirty && m.unsavedDraft) {
              dirty = true;
              summary = summary || String(m.summary||'Unsaved changes');
            }
            return JSON.stringify({dirty:dirty, summary:summary});
          } catch (e) {
            return JSON.stringify({dirty:false,summary:''});
          }
        })();
        """
        webView.evaluateJavaScript(js) { result, _ in
            guard let raw = result as? String,
                  let data = raw.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else {
                let m = KenosNativeCapabilityBridge.lastNavManifest
                finishOnMain(LeaveProbe(dirty: m.unsavedDraft, summary: m.summary))
                return
            }
            let probe = LeaveProbe(
                dirty: obj["dirty"] as? Bool ?? false,
                summary: obj["summary"] as? String ?? ""
            )
            if probe.dirty {
                KenosLog.info("leave probe dirty", category: .bridge, metadata: [
                    "summary": String(probe.summary.prefix(120)),
                ])
            }
            finishOnMain(probe)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.28) {
            let m = KenosNativeCapabilityBridge.lastNavManifest
            finishOnMain(LeaveProbe(dirty: m.unsavedDraft, summary: m.summary))
        }
    }

    static func discardDraft(completion: (() -> Void)? = nil) {
        KenosLog.info("discard domain draft", category: .bridge, metadata: ["breadcrumb": "1"])
        guard let webView = activeWebView else {
            completion?()
            return
        }
        webView.evaluateJavaScript(
            "try{window.__KENOS_LEAVE_GUARD__&&window.__KENOS_LEAVE_GUARD__.discard()}catch(e){}"
        ) { _, _ in
            Task { @MainActor in completion?() }
        }
    }

    static func openCompose(completion: (() -> Void)? = nil) {
        KenosLog.info("open domain compose", category: .bridge, metadata: ["breadcrumb": "1"])
        guard let webView = activeWebView else {
            completion?()
            return
        }
        webView.evaluateJavaScript(
            "try{(window.__KENOS_DOMAIN_COMPOSE__||(window.__KENOS_LEAVE_GUARD__&&window.__KENOS_LEAVE_GUARD__.compose))?.()}catch(e){}"
        ) { _, _ in
            Task { @MainActor in completion?() }
        }
    }
}
#endif
