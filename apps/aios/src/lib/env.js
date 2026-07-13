/**
 * 云端托管构建标志(Netlify 版)。由 netlify.toml 的 build.environment
 * VITE_AIOS_CLOUD=1 注入,构建时内联。本地(Tauri app / 5219 web / dev)为 false。
 *
 * 云端版没有本地 AI 网关,主要作「登录后查看已同步数据」的只读查看器:
 * 据此把首屏「数据不出这台设备」的文案改为诚实的云端说明,并引导登录。
 */
export const CLOUD_BUILD = import.meta.env.VITE_AIOS_CLOUD === '1'
