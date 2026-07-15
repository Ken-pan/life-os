import Foundation

/// Life OS 统一 Supabase 项目。
/// URL 与 publishable key 与 packages/sync/src/supabaseClient.js:5-7 同源同值;
/// publishable key 可安全内嵌客户端,真正的防线是 RLS(home schema 不授 anon)。
enum Config {
    static let supabaseURL = URL(string: "https://iueozzuctstwvzbcxcyh.supabase.co")!
    static let supabasePublishableKey = "sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL"
    static let scanPhotoBucket = "home-scan-photos"
    /// payload jsonb 契约版本,与 apps/home/src/lib/cloud-scan.js 同步演进
    static let payloadFormatVersion = 1
}
