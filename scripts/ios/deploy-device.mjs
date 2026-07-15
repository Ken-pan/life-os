#!/usr/bin/env node
/**
 * 把一个 Life OS app 构建、签名、安装并启动到真机 iPhone。
 *
 * 用法：
 *   node scripts/ios/deploy-device.mjs music              # 自动选唯一可用设备
 *   node scripts/ios/deploy-device.mjs music --device <UDID>
 *   node scripts/ios/deploy-device.mjs music --no-launch  # 只装不启动
 *   node scripts/ios/deploy-device.mjs music --list       # 列出可用设备
 *
 * 前提：iPhone 已与本机配对（Xcode 里信任过），Xcode 里登录过 Apple ID。
 * 签名 team 从 IOS_DEVELOPMENT_TEAM 环境变量或已装的 provisioning profile 推断。
 */
import { execSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
let appDir = null;
let deviceArg = null;
let LIST = false;
let NO_LAUNCH = false;
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--device') deviceArg = argv[++i];
  else if (arg === '--list') LIST = true;
  else if (arg === '--no-launch') NO_LAUNCH = true;
  else if (!arg.startsWith('--') && !appDir) appDir = arg;
}

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/**
 * 已配对的 iPhone/iPad，含当前是否可达。走 JSON 而非表格输出——设备名里的 emoji
 * 和连续空格会让列宽解析出错。
 *
 * online 判据是 transportType 有值：配对状态是历史事实（拔线后仍是 paired），
 * 只有 transport 才说明此刻连得上。tunnelState 不用管，devicectl 会按需建隧道。
 * @returns {{ id: string, name: string, model: string, online: boolean }[]}
 */
function pairedDevices() {
  const out = mkdtempSync(join(tmpdir(), 'lifeos-ios-'));
  const jsonPath = join(out, 'devices.json');
  try {
    execSync(`xcrun devicectl list devices --json-output '${jsonPath}' >/dev/null 2>&1`);
    const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
    return (data.result?.devices ?? [])
      .filter(
        (d) =>
          /iPhone|iPad/i.test(d.hardwareProperties?.deviceType ?? '') &&
          d.connectionProperties?.pairingState === 'paired',
      )
      .map((d) => ({
        id: d.identifier,
        name: d.deviceProperties?.name ?? d.identifier,
        model: d.hardwareProperties?.marketingName ?? d.hardwareProperties?.deviceType ?? '',
        online: Boolean(d.connectionProperties?.transportType),
      }));
  } catch {
    return [];
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const OFFLINE_HINT = '设备已配对但当前连不上。用数据线连上 iPhone 并解锁屏幕（或确认与本机同一 Wi-Fi 且已开启无线调试），然后重试。';

function developmentTeam() {
  if (process.env.IOS_DEVELOPMENT_TEAM) return process.env.IOS_DEVELOPMENT_TEAM;
  const dir = join(process.env.HOME, 'Library/Developer/Xcode/UserData/Provisioning Profiles');
  if (!existsSync(dir)) return null;
  for (const f of execSync(`ls '${dir}' 2>/dev/null`, { encoding: 'utf8' }).split('\n')) {
    if (!f.endsWith('.mobileprovision')) continue;
    try {
      const plist = execSync(`security cms -D -i '${join(dir, f)}' 2>/dev/null`, { encoding: 'utf8', maxBuffer: 1 << 22 });
      const team = plist.match(/<key>TeamIdentifier<\/key>\s*<array>\s*<string>([^<]+)</)?.[1];
      if (team) return team;
    } catch {
      /* 跳过读不出的 profile */
    }
  }
  return null;
}

const devices = pairedDevices();

if (LIST) {
  if (!devices.length) {
    console.log('没有配对过的 iPhone/iPad——先用数据线连上并在 Xcode 里信任本机。');
  } else {
    console.log('已配对设备（● 在线 / ○ 离线）：');
    for (const d of devices) console.log(`  ${d.online ? '●' : '○'} ${d.id}  ${d.name} (${d.model})`);
  }
  process.exit(0);
}

if (!appDir) {
  console.error('用法: node scripts/ios/deploy-device.mjs <app> [--device <UDID>] [--no-launch] [--list]');
  process.exit(1);
}

const appPath = join(root, 'apps', appDir);
const manifestPath = join(appPath, 'app.manifest.json');
if (!existsSync(manifestPath)) {
  console.error(`找不到 ${manifestPath}`);
  process.exit(1);
}
if (!existsSync(join(appPath, 'ios'))) {
  console.error(`apps/${appDir} 还没有 iOS 壳。先跑：npm run ios:add ${appDir}`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const bundleId = `os.lifeos.${manifest.id}`;

// 只在在线设备里选：离线设备会一路跑到 install 才崩，白等一次完整构建
const online = devices.filter((d) => d.online);
let device;
if (deviceArg) {
  device = devices.find((d) => d.id === deviceArg);
  if (!device) {
    console.error(`设备 ${deviceArg} 没配对过。--list 可查看已配对设备。`);
    process.exit(1);
  }
  if (!device.online) {
    console.error(`${device.name}：${OFFLINE_HINT}`);
    process.exit(1);
  }
} else if (online.length === 0) {
  console.error(
    devices.length ? `没有在线设备。${OFFLINE_HINT}` : '没有配对过的 iPhone/iPad——先用数据线连上并在 Xcode 里信任本机。',
  );
  process.exit(1);
} else if (online.length > 1) {
  console.error('有多台设备在线，用 --device <UDID> 指定：');
  for (const d of online) console.error(`  ${d.id}  ${d.name} (${d.model})`);
  process.exit(1);
} else {
  device = online[0];
}

const team = developmentTeam();
if (!team) {
  console.error('推断不出开发团队。在 Xcode 里登录 Apple ID 并运行一次真机构建，或设 IOS_DEVELOPMENT_TEAM=<TeamID>。');
  process.exit(1);
}

// DerivedData 已在 cap add 生成的 ios/.gitignore 里
const derived = join(appPath, 'ios/DerivedData');
const appBundle = join(derived, 'Build/Products/Debug-iphoneos/App.app');

console.log(`部署 ${manifest.name} → ${device.name}${device.model ? ` (${device.model})` : ''}`);
console.log(`  bundle ${bundleId} · team ${team}\n`);

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

console.log('▸ 构建 Web 产物并同步');
run('npm run ios:sync', appPath);

console.log('\n▸ 真机签名构建');
run(
  `xcodebuild -project App.xcodeproj -scheme App -configuration Debug ` +
    `-destination 'generic/platform=iOS' -derivedDataPath '${derived}' ` +
    `-allowProvisioningUpdates DEVELOPMENT_TEAM=${team} CODE_SIGN_STYLE=Automatic ` +
    `build -quiet`,
  join(appPath, 'ios/App'),
);

console.log('\n▸ 安装到设备');
execFileSync('xcrun', ['devicectl', 'device', 'install', 'app', '--device', device.id, appBundle], { stdio: 'inherit' });

if (!NO_LAUNCH) {
  console.log('\n▸ 启动');
  execFileSync('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', device.id, bundleId], { stdio: 'inherit' });
}

console.log(`\n完成 —— ${manifest.name} 已在 ${device.name} 上${NO_LAUNCH ? '安装' : '运行'}。`);
