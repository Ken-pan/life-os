import Foundation
import RoomPlan
import simd

/// RoomPlan 采集结果 → FlatScene(俯视 2D,米)。
/// ARKit 世界系 y 朝上;俯视图取 (x, z):x 右、z 作画面向下 —— 与楼层平面同手性。
/// 多房间共享同一 ARSession,坐标系天然一致,这里直接合并不做配准。
enum StructureFlattener {
    static func flatten(rooms: [CapturedRoom]) -> FlatScene {
        var scene = FlatScene()

        // 门窗宿主要按 surface identifier 找墙,先全屋建索引
        var wallIndexById: [UUID: Int] = [:]

        for room in rooms {
            for wall in room.walls {
                let seg = wallSegment(wall)
                wallIndexById[wall.identifier] = scene.walls.count
                scene.walls.append(
                    FlatScene.WallSeg(
                        a: seg.a,
                        b: seg.b,
                        confidenceLow: wall.confidence == .low
                    )
                )
            }
        }

        for room in rooms {
            for surface in room.doors {
                scene.openings.append(opening(surface, kind: .door, wallIndexById: wallIndexById))
            }
            for surface in room.windows {
                scene.openings.append(opening(surface, kind: .window, wallIndexById: wallIndexById))
            }
            for surface in room.openings {
                scene.openings.append(opening(surface, kind: .opening, wallIndexById: wallIndexById))
            }

            for object in room.objects {
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

            // 地板多边形 → 分区;收齐中心点落在多边形内的全部 section
            // (一次扫描常横跨厨房+客厅,命名交给 PlanProjector 拼接)
            let sections = room.sections.map {
                (label: String(describing: $0.label), center: SIMD2(Double($0.center.x), Double($0.center.z)))
            }
            for floor in room.floors {
                let poly = floorPolygon(floor)
                guard poly.count >= 3 else { continue }
                var labels = sections
                    .filter { PlanProjector.pointInPolygon($0.center, poly) }
                    .map(\.label)
                if labels.isEmpty, let first = sections.first?.label {
                    labels = [first]
                }
                scene.rooms.append(FlatScene.RoomPoly(labels: labels, points: poly))
            }

            if room.walls.contains(where: { $0.confidence == .low }) {
                scene.warnings.append("有低置信度墙段(镜面/玻璃干扰?),建议核对尺寸")
            }
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
