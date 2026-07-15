#!/usr/bin/env node
/**
 * 一键给任意 Life OS app 加 iOS 原生壳（Capacitor 8 · SPM 模式，无需 CocoaPods）。
 *
 * 用法：
 *   node scripts/ios/add-ios.mjs <app>            # app = apps/ 下目录名，如 fitness
 *   node scripts/ios/add-ios.mjs music --background-audio   # 音频类 app：真后台播放
 *   node scripts/ios/add-ios.mjs fitness --dry-run          # 只打印将执行的步骤
 *
 * 做的事：
 *   1. 装 @capacitor/core + @capacitor/ios（deps）、@capacitor/cli（dev）
 *   2. 从 app.manifest.json 生成 capacitor.config.json（appId=os.lifeos.<id>）
 *   3. npx cap add ios --packagemanager SPM
 *   4. Info.plist：ITSAppUsesNonExemptEncryption=false；--background-audio 时加 UIBackgroundModes
 *   5. --background-audio 时 AppDelegate 激活 AVAudioSession(.playback)
 *   6. App 图标（static/icon-512.png → 1024）+ 品牌深色纯色启动屏
 *   7. app package.json 注入 ios:sync / ios:open / ios:build:sim 脚本
 *
 * 之后每次改完 Web 代码：npm run ios:sync；上真机：npm run ios:open。
 * 需要锁屏播放控制的 app 另装 @life-os/capacitor-nowplaying（见包内 README）。
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const [, , appDir, ...flags] = process.argv;
const DRY = flags.includes('--dry-run');
const BG_AUDIO = flags.includes('--background-audio');

if (!appDir) {
  console.error('用法: node scripts/ios/add-ios.mjs <app> [--background-audio] [--dry-run]');
  process.exit(1);
}

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const appPath = join(root, 'apps', appDir);
const manifestPath = join(appPath, 'app.manifest.json');
if (!existsSync(manifestPath)) {
  console.error(`找不到 ${manifestPath} —— app 名应是 apps/ 下的目录名`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const appId = `os.lifeos.${manifest.id}`;
const appName = manifest.name || manifest.id;
const darkBg = manifest.themeColor?.dark || '#0d0d0e';
const workspace = manifest.workspace;

function step(title, fn) {
  console.log(`\n▸ ${title}`);
  if (DRY) return;
  fn();
}
function sh(cmd, cwd = appPath) {
  console.log(`  $ ${cmd}`);
  if (!DRY) execSync(cmd, { cwd, stdio: 'inherit' });
}

console.log(`为 ${appName}（${appId}）添加 iOS 壳${DRY ? '【dry-run】' : ''}`);
console.log(`  背景色 ${darkBg} · 后台音频 ${BG_AUDIO ? '开' : '关'}`);

// 1. 依赖
step('安装 Capacitor 依赖', () => {
  sh(`npm install -w ${workspace} @capacitor/core@^8 @capacitor/ios@^8`, root);
  sh(`npm install -w ${workspace} -D @capacitor/cli@^8`, root);
});

// 2. capacitor.config.json
step('生成 capacitor.config.json', () => {
  const cfgPath = join(appPath, 'capacitor.config.json');
  if (existsSync(cfgPath)) return console.log('  已存在，跳过');
  writeFileSync(
    cfgPath,
    JSON.stringify(
      {
        appId,
        appName,
        webDir: 'build',
        ios: { contentInset: 'never', backgroundColor: darkBg },
      },
      null,
      2,
    ) + '\n',
  );
});

// 3. 原生工程（cap add 需要 webDir 存在）
step('生成 iOS 原生工程（SPM）', () => {
  if (existsSync(join(appPath, 'ios'))) return console.log('  ios/ 已存在，跳过');
  if (!existsSync(join(appPath, 'build'))) sh('npm run build');
  sh('npx cap add ios --packagemanager SPM');
});

// 4. Info.plist
step('Info.plist 补丁', () => {
  const plistPath = join(appPath, 'ios/App/App/Info.plist');
  let plist = readFileSync(plistPath, 'utf8');
  if (!plist.includes('ITSAppUsesNonExemptEncryption')) {
    plist = plist.replace(
      /(\t<key>LSRequiresIPhoneOS<\/key>)/,
      '\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>\n$1',
    );
  }
  if (BG_AUDIO && !plist.includes('UIBackgroundModes')) {
    plist = plist.replace(
      /(\t<key>LSRequiresIPhoneOS<\/key>\n\t<true\/>)/,
      '$1\n\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>audio</string>\n\t</array>',
    );
  }
  writeFileSync(plistPath, plist);
});

// 5. AppDelegate：后台音频会话
step('AppDelegate 音频会话（仅 --background-audio）', () => {
  if (!BG_AUDIO) return console.log('  未开启，跳过');
  const path = join(appPath, 'ios/App/App/AppDelegate.swift');
  let src = readFileSync(path, 'utf8');
  if (src.includes('AVAudioSession')) return console.log('  已有，跳过');
  src = src.replace('import UIKit', 'import UIKit\nimport AVFoundation');
  src = src.replace(
    /(didFinishLaunchingWithOptions launchOptions: \[UIApplication\.LaunchOptionsKey: Any\]\?\) -> Bool \{\n)/,
    `$1        // 后台/锁屏持续播放：没有 .playback 会话时，WKWebView 的音频在锁屏后会被系统暂停\n        do {\n            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)\n            try AVAudioSession.sharedInstance().setActive(true)\n        } catch {\n            print("AVAudioSession setup failed: \\(error)")\n        }\n`,
  );
  writeFileSync(path, src);
});

// 6. 图标 + 启动屏
step('App 图标与启动屏', () => {
  const icon = join(appPath, 'static/icon-512.png');
  const target = join(appPath, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
  if (existsSync(icon)) {
    execSync(`sips -z 1024 1024 '${icon}' --out '${target}' >/dev/null`);
  } else {
    console.log('  ⚠ 缺 static/icon-512.png，保留 Capacitor 默认图标');
  }
  const splash = solidPng(2732, 2732, darkBg);
  const splashDir = join(appPath, 'ios/App/App/Assets.xcassets/Splash.imageset');
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    writeFileSync(join(splashDir, f), splash);
  }
});

// 7. npm scripts
step('注入 npm scripts', () => {
  const pkgPath = join(appPath, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.scripts ??= {};
  pkg.scripts['ios:sync'] ??= 'npm run build && cap sync ios';
  pkg.scripts['ios:open'] ??= 'cap open ios';
  pkg.scripts['ios:build:sim'] ??=
    "npm run ios:sync && xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build";
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
});

console.log(`\n完成。下一步：
  cd apps/${appDir}
  npm run ios:build:sim   # 模拟器构建验证
  npm run ios:open        # Xcode 选签名 → 真机运行
需要锁屏播放控制（音频类 app）：npm install -w ${workspace} '@life-os/capacitor-nowplaying@*'，
JS 侧接法见 packages/capacitor-nowplaying/src/index.js 头注释与 apps/music/src/lib/mediaSession.js。`);

/** 生成纯色 PNG（无外部依赖） */
function solidPng(w, h, hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const scan = Buffer.alloc(1 + w * 3);
  scan[0] = 0;
  for (let x = 0; x < w; x++) {
    scan[1 + x * 3] = r;
    scan[2 + x * 3] = g;
    scan[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: h }, () => scan));
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}
