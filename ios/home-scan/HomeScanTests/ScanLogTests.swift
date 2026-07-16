import XCTest
@testable import HomeScan

/// ScanLog 的纯函数核:编码/渲染/轮换/聚合。
/// 文件 IO 与队列不在此测 —— 事件低频、逐行 append,坏也坏不出花;
/// 但**编码格式**和**聚合口径**是日志的契约,变了下游分析全瞎。
final class ScanLogTests: XCTestCase {

    // MARK: 编码

    func testEncodeLineIsDeterministicSortedJSON() {
        let e = ScanLog.Event(
            t: 1_784_000_000_000, cat: "perf", name: "merge_all",
            attrs: ["rooms": 3, "ms": 1234.5, "ok": true, "label": "全屋"]
        )
        let line = ScanLog.encodeLine(e)
        XCTAssertEqual(
            line,
            #"{"attrs":{"label":"全屋","ms":1234.5,"ok":true,"rooms":3},"cat":"perf","name":"merge_all","t":1784000000000}"#
        )
    }

    func testValueRoundtripThroughJSON() throws {
        let e = ScanLog.Event(
            t: 1, cat: "a", name: "b",
            attrs: ["s": .string("文字"), "n": .num(2.5), "i": 7, "b": .bool(false)]
        )
        let data = try JSONEncoder().encode(e)
        let back = try JSONDecoder().decode(ScanLog.Event.self, from: data)
        XCTAssertEqual(back.attrs["s"], .string("文字"))
        XCTAssertEqual(back.attrs["n"], .num(2.5))
        XCTAssertEqual(back.attrs["i"], .num(7))
        XCTAssertEqual(back.attrs["b"], .bool(false))
    }

    func testRenderLineReadable() {
        let e = ScanLog.Event(t: 0, cat: "ux", name: "hint", attrs: ["kind": "tracking", "n": 2])
        XCTAssertEqual(ScanLog.renderLine(e), "◆ [ux] hint · kind=tracking n=2")
        // 整数显示不带小数点(1234 不是 1234.0)—— 控制台是给人看的
        let p = ScanLog.Event(t: 0, cat: "perf", name: "m", attrs: ["ms": 1234])
        XCTAssertEqual(ScanLog.renderLine(p), "◆ [perf] m · ms=1234")
    }

    // MARK: 轮换

    func testFilesToPruneKeepsNewestAndIgnoresForeignFiles() {
        let names = [
            "scanlog-20260710-090000-app.jsonl",
            "scanlog-20260712-090000-scan-full.jsonl",
            "scanlog-20260714-090000-scan-full.jsonl",
            "scanlog-20260716-090000-app.jsonl",
            "running.flag",          // 不是日志,绝不能被轮换删掉
            "notes.txt",
        ]
        let prune = ScanLog.filesToPrune(names, keep: 2)
        XCTAssertEqual(prune.sorted(), [
            "scanlog-20260710-090000-app.jsonl",
            "scanlog-20260712-090000-scan-full.jsonl",
        ])
    }

    func testFilesToPruneUnderLimitDeletesNothing() {
        XCTAssertEqual(ScanLog.filesToPrune(["scanlog-1.jsonl"], keep: 8), [])
    }

    // MARK: 聚合口径(count / add / peak)

    func testAggregatorSemantics() {
        var a = ScanLog.DiagnosticsAggregator()
        a.count("gate_dark")
        a.count("gate_dark")
        a.add("upload_kb", 100.04)
        a.add("upload_kb", 50)
        a.peak("stall_worst_ms", 300)
        a.peak("stall_worst_ms", 120)   // 更小的峰值不回退
        a.set("rooms", 3)
        let s = a.summary()
        XCTAssertEqual(s["gate_dark"], 2)
        XCTAssertEqual(s["upload_kb"], 150.0)  // summary 四舍五入到 0.1
        XCTAssertEqual(s["stall_worst_ms"], 300)
        XCTAssertEqual(s["rooms"], 3)
    }

    // MARK: 诊断摘要 → payload 契约

    func testMetaCarriesScanDiagnostics() throws {
        var meta = HomeOSProject.Meta(
            id: "m", nameZh: "扫", sqft: nil, scanWarnings: [],
            sourceNote: nil, scanScope: nil, scanDiagnostics: nil
        )
        meta.scanDiagnostics = ["merge_all_ms": 1523.5, "rooms": 3]
        let data = try JSONEncoder().encode(meta)
        let back = try JSONDecoder().decode(HomeOSProject.Meta.self, from: data)
        XCTAssertEqual(back.scanDiagnostics?["merge_all_ms"], 1523.5)
        // 旧 payload(无此字段)必须照常解码 —— 加法式契约的底线
        let legacy = #"{"id":"m","nameZh":"扫","scanWarnings":[]}"#
        let old = try JSONDecoder().decode(HomeOSProject.Meta.self, from: Data(legacy.utf8))
        XCTAssertNil(old.scanDiagnostics)
    }
}
