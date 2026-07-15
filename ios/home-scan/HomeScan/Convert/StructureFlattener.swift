import Foundation
import RoomPlan
import simd

/// RoomPlan 采集结果 → FlatScene(俯视 2D,米)。
/// ARKit 世界系 y 朝上;俯视图取 (x, z):x 右、z 作画面向下 —— 与楼层平面同手性。
///
/// ⚠️ 只吃 **CapturedStructure 顶层**的 walls/doors/objects/floors/sections ——
/// 那是 StructureBuilder 跨房间合并去重后的结果。早期版本遍历 `structure.rooms`,
/// 同一件家具在重叠房间里会被数两遍。
enum StructureFlattener {
    static func flatten(structure: CapturedStructure) -> FlatScene {
        var scene = FlatScene()

        // 门窗宿主要按 surface identifier 找墙,先建索引
        var wallIndexById: [UUID: Int] = [:]
        for wall in structure.walls {
            let seg = wallSegment(wall)
            wallIndexById[wall.identifier] = scene.walls.count
            scene.walls.append(
                FlatScene.WallSeg(a: seg.a, b: seg.b, confidenceLow: wall.confidence == .low)
            )
        }

        for surface in structure.doors {
            scene.openings.append(opening(surface, kind: .door, wallIndexById: wallIndexById))
        }
        for surface in structure.windows {
            scene.openings.append(opening(surface, kind: .window, wallIndexById: wallIndexById))
        }
        for surface in structure.openings {
            scene.openings.append(opening(surface, kind: .opening, wallIndexById: wallIndexById))
        }

        for object in structure.objects {
            let t = object.transform
            let axis = normalize2(SIMD2(Double(t.columns.0.x), Double(t.columns.0.z)))
            scene.items.append(
                FlatScene.Item(
                    category: categoryName(object.category),
                    center: translation2(t),
                    axisDeg: atan2(axis.y, axis.x) * 180 / .pi,
                    widthM: Double(object.dimensions.x),
                    depthM: Double(object.dimensions.z)
                )
            )
        }

        // 功能区中心 —— 分区切分的依据(见 PlanProjector.zonesFromSections)
        scene.sections = structure.sections.map {
            FlatScene.Section(
                label: String(describing: $0.label),
                center: SIMD2(Double($0.center.x), Double($0.center.z))
            )
        }

        // 地板多边形。全屋扫描常只给一整块,靠 sections 再切;
        // labels 仅在 sections 缺失时兜底命名。
        for floor in structure.floors {
            let poly = floorPolygon(floor)
            guard poly.count >= 3 else { continue }
            var labels = scene.sections
                .filter { PlanProjector.pointInPolygon($0.center, poly) }
                .map(\.label)
            if labels.isEmpty, let first = scene.sections.first?.label {
                labels = [first]
            }
            scene.rooms.append(FlatScene.RoomPoly(labels: labels, points: poly))
        }

        if structure.walls.contains(where: { $0.confidence == .low }) {
            scene.warnings.append("有低置信度墙段(镜面/玻璃干扰?),建议核对尺寸")
        }
        return scene
    }

    // MARK: - Surface 拆解

    /// 墙中心 ± 局部 x 轴 × 半宽 → 2D 线段
    private static func wallSegment(_ wall: CapturedRoom.Surface) -> (a: SIMD2<Double>, b: SIMD2<Double>) {
        let t = wall.transform
        let center = translation2(t)
        let axis = normalize2(SIMD2(Double(t.columns.0.x), Double(t.columns.0.z)))
        let half = Double(wall.dimensions.x) / 2
        return (a: center - axis * half, b: center + axis * half)
    }

    private static func opening(
        _ surface: CapturedRoom.Surface,
        kind: FlatScene.OpeningKind,
        wallIndexById: [UUID: Int]
    ) -> FlatScene.Opening {
        FlatScene.Opening(
            kind: kind,
            center: translation2(surface.transform),
            widthM: Double(surface.dimensions.x),
            wallIndex: surface.parentIdentifier.flatMap { wallIndexById[$0] }
        )
    }

    /// 地板角点(surface 局部系) → 世界 → 俯视 2D
    private static func floorPolygon(_ floor: CapturedRoom.Surface) -> [SIMD2<Double>] {
        floor.polygonCorners.map { corner in
            let world = floor.transform * SIMD4(corner, 1)
            return SIMD2(Double(world.x), Double(world.z))
        }
    }

    /// Object.Category → KindMaps key("bed"/"sofa"/…)。
    /// String(describing:) 对无关联值的 enum case 就是 case 名,与 KindMaps 键一致。
    private static func categoryName(_ category: CapturedRoom.Object.Category) -> String {
        String(describing: category)
    }

    private static func translation2(_ t: simd_float4x4) -> SIMD2<Double> {
        SIMD2(Double(t.columns.3.x), Double(t.columns.3.z))
    }

    private static func normalize2(_ v: SIMD2<Double>) -> SIMD2<Double> {
        let len = (v.x * v.x + v.y * v.y).squareRoot()
        guard len > 1e-9 else { return SIMD2(1, 0) }
        return v / len
    }
}
