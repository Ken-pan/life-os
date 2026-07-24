import Foundation

/// 导航标题的英文 SSOT → 中文映射。
///
/// 真源是 `KenosDomainRegistry` 里的英文 `label` / `title`(它同时是 web 契约、
/// 深链、测试断言的键),中文只是**显示层**的一层翻译 —— 所以这里做成纯函数,
/// 而不是往注册表里塞第二套名字。
///
/// 抽出来的原因:Space Peek 也要显示同一批名字。此前这份 switch 私有在
/// `KenosGlobalDock` 里,Peek 只能显示英文 —— 于是同一屏出现「空间」标题配
/// Training / Finance / Work 的英文卡片(真机实拍)。两处各抄一份必然漂移,
/// 故统一到这里,由 Dock 与 Peek 共同消费。
enum KenosLocalizedTitles {
    static func navigation(_ title: String, chinese: Bool) -> String {
        guard chinese else {
            // Training hub 的 SSOT 标题是 Resources;英文界面显示产品名 Library。
            if title == "Discover" || title == "Explore" || title == "Resources" {
                return "Library"
            }
            return title
        }
        switch title {
        case "Spaces": return "空间"
        case "Close Spaces": return "关闭空间"
        case "Tasks": return "任务"
        case "Calendar": return "日历"
        case "Inbox": return "收件箱"
        case "More": return "更多"
        case "Today": return "今日"
        case "Program": return "计划"
        case "Discover", "Explore", "Resources": return "资料"
        case "Library": return "资料库"
        case "Exercises": return "动作库"
        case "Workout", "Training": return "训练"
        case "History": return "历史"
        case "Focus": return "专注"
        case "Ask", "Assistant": return "问答"
        case "Settings": return "设置"
        case "Home": return "家"
        case "Search": return "搜索"
        case "Rooms": return "房间"
        case "Items": return "物品"
        case "Organize": return "整理"
        case "Status": return "状态"
        case "Trends": return "趋势"
        case "Accounts": return "账户"
        case "Money", "Finance": return "财务"
        case "Music": return "音乐"
        case "Work", "Deep Work": return "工作"
        case "Plan": return "计划"
        case "Current": return "当前"
        case "Recent": return "最近"
        case "Other Spaces", "All Spaces": return "其他空间"
        case "Health": return "健康"
        case "Code": return "代码"
        case "Paper": return "纸笔"
        default: return title
        }
    }
}
