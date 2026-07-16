import SwiftUI

/// HomeScan 的视觉语言 —— iOS 26 Liquid Glass。
///
/// 存在的理由:玻璃这套东西**很容易各写各的**。同样是个 HUD 胶囊,这里
/// `.ultraThinMaterial + Capsule`、那里 `.glassEffect(.regular, in: .capsule)`,
/// 混在一屏上就是明显的两代产物。把它收成几个具名修饰符,新页面照着用就行,
/// 想整体调也只有一处。
///
/// 分寸(HIG 的核心一条):**玻璃是给控件用的,不是给内容用的**。
/// 它靠折射背后的东西产生层次 —— 满屏都是玻璃就没有背后,层次归零。
/// 所以这里只提供「浮在内容/取景器之上的控件」用的样式,列表行、卡片正文
/// 一律走系统默认,别往上贴。
enum HS {

    // MARK: - 尺度

    /// 触控目标下限。HIG 是 44pt;扫描时人举着手机、单手、还在走动,
    /// 给到 48 才不会点不中(实测举着扫时误触率明显高于坐着用)。
    static let hitMin: CGFloat = 48

    enum Space {
        static let hair: CGFloat = 4
        static let tight: CGFloat = 8
        static let snug: CGFloat = 12
        static let base: CGFloat = 16
        static let loose: CGFloat = 24
    }

    // MARK: - 语义色
    //
    // 直接写 .orange/.green 的问题是「橙色代表什么」散落在各处,
    // 改一次要全局找。这里定名字,用的地方说语义。
    //
    // ⚠️ **图标色和文字色是两回事**,别混用 —— 系统的鲜艳色是给填充和图标设计的,
    // 拿去当正文颜色会直接掉进对比度不达标。实测(从真机截图上采样计算):
    //   systemOrange 浅色 #FF9500 on #F2F2F7 = **1.97:1**,WCAG AA 正文要 4.5:1,
    //   连一半都不到。深色下同一个橙是 8.28:1,反而很安全。
    // 所以橙色文字必须**随外观切换**:浅色用暗橙,深色沿用系统亮橙。
    // 红/绿在两种外观下都够,不用特殊处理。

    /// 需要立刻处理 —— **图标/填充/徽标**用。文字请用 {@link warnText}。
    static let warn = Color.orange
    /// 警告**文字**。浅色 #B45309(实测 4.50:1 达标),深色沿用系统亮橙(8.28:1)。
    /// 数值不是拍的:见本段头注释,是从截图采样 + WCAG 公式算出来的。
    static let warnText = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor.systemOrange
            : UIColor(red: 0xB4 / 255, green: 0x53 / 255, blue: 0x09 / 255, alpha: 1)
    })
    /// 出错了 —— **图标/填充**用(systemRed 浅色 3.18:1,过图标的 3:1 线)。
    /// 文字请用 {@link dangerText}。
    static let danger = Color.red
    /// 错误**文字**。浅色 #A3341F(6.13:1),深色沿用 systemRed(4.99:1)。
    /// 「红色够显眼所以肯定够对比度」是错觉:systemRed 浅色只有 3.18:1,
    /// 正文要 4.5 —— 这条是被 ContrastTests 当场抓出来的,不是我看出来的。
    static let dangerText = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor.systemRed
            : UIColor(red: 0xA3 / 255, green: 0x34 / 255, blue: 0x1F / 255, alpha: 1)
    })
    /// 成了 / 对上了
    static let good = Color.green
    /// 中性强调(主操作、进度)
    static let accent = Color.accentColor
}

// MARK: - 浮层控件
//
// 用玻璃之前先过这一关:**它浮在会变的东西上面吗?**
//
// 玻璃靠折射背后的内容产生层次。背后是实时相机画面 → 折射有意义,而且能同时做到
// 「看得清字」和「看得见字背后的房间」(magic 就在这:material 是磨砂,会把房间
// 糊掉,而扫描时房间才是用户真正要看的东西)。背后是一张不动的列表卡片、或者一片
// 纯背景 → 折射不出任何东西,只剩一层没意义的白模糊,还白花一份渲染。
//
// 三条硬规矩,踩了就是不像原生:
//   1. **不叠玻璃**。玻璃面板里的按钮走系统常规样式 —— 官方原话是
//      「glass cannot sample other glass」:内层玻璃采样到的是外层玻璃,
//      出来是浑的。Apple 自己也这么分:sheet 拿玻璃,里面的按钮是实心。
//   2. **列表行、表单、纯背景页上的按钮不用玻璃**,那儿没有"背后"。
//   3. **同排/相邻的玻璃必须共用一个 GlassEffectContainer**。容器 = 共享采样域。
//      不包的话每块玻璃各自采背景:同一排上长得不一样,还各跑一遍背板采样。
//      也别套两层容器 —— 那等于又把采样域切开。
//
// 关于「玻璃压在实时相机画面上到底看不看得清」(NN/g 批评 Liquid Glass 时点名的
// 最坏场景:背景多变时字会糊进去):**这个 App 靠锁定深色解决**。
// 实测(黑→白渐变靶子 + 采样计算):锁死深色后玻璃恒为深色,背景从 #333 亮到 #B4B4B3,
// 玻璃只从 #242424 走到 #636363,白字对玻璃全程 6.01:1 ~ 15.52:1,最差也高于 AA 33%。
// 换句话说:**跟随系统外观反而会出事** —— 玻璃自适应会在暗背景上翻亮,
// 而 .primary 在深色下是白字,白字配亮玻璃就没法看了。锁死深色把这条路堵死了。

extension View {
    /// 浮在取景器/内容之上的信息胶囊(HUD 徽标、提示)。
    func hsCapsule(tint: Color? = nil) -> some View {
        self
            .font(.footnote.weight(.medium))
            .foregroundStyle(tint ?? .primary)
            .padding(.horizontal, HS.Space.snug)
            .padding(.vertical, HS.Space.tight)
            .glassEffect(.regular, in: .capsule)
    }

    // 这里曾经有个 hsInteractiveCapsule(`.glassEffect(.regular.interactive())`),
    // 已删 —— 它一处都没用上,而且本来就不该有:
    // 这个 App 里可点的玻璃**全是按钮**,而 `.buttonStyle(.glass)` 自带按压反馈,
    // 不需要手搓。`.interactive()` 是留给「自己做的、非按钮的可点玻璃」的,
    // 我们没有那种东西。
    // (顺带:社区实测 `.glassEffect(.regular.interactive(), in: RoundedRectangle())`
    //  会错误地渲染成胶囊形 —— 官方建议按钮就用 .buttonStyle(.glass),别绕。)

    /// 卡片式浮层(底部操作区、引导面板)
    func hsPanel() -> some View {
        self
            .padding(HS.Space.base)
            .glassEffect(.regular, in: .rect(cornerRadius: 22))
    }

    /// 扫描时的大号触控目标 —— 举着手机单手按得中
    func hsBigHit() -> some View {
        frame(minWidth: HS.hitMin, minHeight: HS.hitMin)
    }
}

// MARK: - 动效

/// 「减弱动态效果」不是可选项。
///
/// 前庭功能敏感的人会被持续/大幅的动效弄到头晕恶心 —— 系统开关打开了就必须听。
/// 这个 App 里最该管住的是上传页那个**永不停歇的旋转圈**:持续旋转正是该关掉的
/// 头号动效。
///
/// 用法:凡是「装饰性」的动画都套 `HS.motion(reduce)`,拿到 nil 就别动。
/// 注意分寸 —— 该关的是**动**,不是**变化**:进度数字该跳还得跳,只是别再飞。
///
/// ⚠️ 这套东西**不是**在跟系统抢活,别照着「让系统自动处理无障碍」一刀砍掉:
/// 系统确实会自动收敛**玻璃自身**的动效(减弱透明度会加厚磨砂、增强对比会加边、
/// 减弱动效会压低玻璃的弹性动画)—— 那部分我们一行都不用写,也确实没写。
/// 但它管不到**我们自己写的**动画:上传页那个 rotationEffect 无限旋转、
/// 进度环的 trim 补间,系统不认识它们。这里管的就是这些。
enum Motion {
    /// @Environment(\.accessibilityReduceMotion) 传进来
    static func anim(_ base: Animation, reduce: Bool) -> Animation? {
        reduce ? nil : base
    }
}

extension View {
    /// 尊重「减弱动态效果」的动画。reduce = true 时直接不加动画(瞬时生效)。
    func hsAnimation<V: Equatable>(_ base: Animation, value: V, reduce: Bool) -> some View {
        animation(Motion.anim(base, reduce: reduce), value: value)
    }
}

// MARK: - Label 排版

/// 图标一列、文字一列。
///
/// SwiftUI 默认的 `Label` 把图标和文字放在同一个文本流里:文字一换行,**第二行
/// 会绕到图标底下**,读起来像排版坏了。中文长句(不像英文有空格断词)+ 大字号
/// 必然触发 —— 实测在辅助功能字号下,「有一次没传完的扫描」「7 件家具照片证据
/// 不足…」全都糊成一坨。
///
/// 这个 style 把图标钉在自己那一列,文字整块缩进对齐,多长都不会跑回来。
/// 基线对齐用 `.firstTextBaseline`:图标跟着第一行文字走,不是跟着整块居中 ——
/// 三行文字的时候居中会让图标飘到中间去。
struct HSIconTextLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: HS.Space.tight) {
            configuration.icon
            configuration.title
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

extension LabelStyle where Self == HSIconTextLabelStyle {
    /// 长文案的 Label 一律用它 —— 见 HSIconTextLabelStyle 的理由
    static var hsIconText: HSIconTextLabelStyle { .init() }
}

// MARK: - 无障碍
//
// 这个 App 之前 accessibilityLabel 是 0 处。纯图标按钮和 AR 引导对
// VoiceOver 完全不可用 —— 而「举着手机看不清屏幕」的场景恰恰最需要它。

extension View {
    /// 给纯图标/装饰性图形的控件补上人话。
    ///
    /// ⚠️ 只对**本来就是单个无障碍元素**的东西有效(Button、Label、Image)。
    /// 用在装了好几个子元素的容器(比如一排 Text + Image 拼的徽标)上是**无效的** ——
    /// accessibilityLabel 盖不住子元素,VoiceOver 照样逐个念。那种情况要先
    /// `.accessibilityElement(children: .ignore)`,见 ScanView 的 counterChip。
    @ViewBuilder
    func hsLabel(_ label: String, hint: String? = nil) -> some View {
        if let hint {
            accessibilityLabel(Text(label)).accessibilityHint(Text(hint))
        } else {
            // 没提示就别挂一个空 Text —— 空 hint 是噪音,不是"无"
            accessibilityLabel(Text(label))
        }
    }
}
