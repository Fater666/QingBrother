/**
 * 一键构建 Android Release 并上传至 TapTap
 * 文档: https://developer.taptap.cn/docs/sdk/upload/guide/
 *
 * 使用前: 复制 scripts/taptap-upload.config.example.json 为 scripts/taptap-upload.config.json
 * 并填写 client_id、server_secret、app_id（勿提交 config 到 Git）
 *
 * 运行: node scripts/upload-taptap.js  或  npm run taptap:upload
 */

import { createHmac } from 'crypto';
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ANDROID_DIR = join(ROOT, 'android');
const BUILD_GRADLE_PATH = join(ANDROID_DIR, 'app', 'build.gradle');
const APK_PATH = join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const CONFIG_PATH = join(__dirname, 'taptap-upload.config.json');
const UPLOAD_PARAMS_URL = 'https://cloud.tapapis.cn/apk/v1/upload-params';

function log(msg, type = 'info') {
  const prefix = type === 'err' ? '[错误]' : type === 'ok' ? '[完成]' : '[TapTap]';
  console.log(`${prefix} ${msg}`);
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    log('未找到 scripts/taptap-upload.config.json', 'err');
    log('请复制 scripts/taptap-upload.config.example.json 为 taptap-upload.config.json 并填写 client_id、server_secret、app_id', 'err');
    process.exit(1);
  }
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  let config;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    log('taptap-upload.config.json 格式错误，应为 JSON', 'err');
    process.exit(1);
  }
  const { client_id, server_secret, app_id } = config;
  if (!client_id || !server_secret || !app_id) {
    log('请在 taptap-upload.config.json 中填写 client_id、server_secret、app_id', 'err');
    process.exit(1);
  }
  // TapTap 要求 app_id 为数字（游戏在 TapTap 的数字 ID，如 58881），不能是 client_id/server_secret
  const appIdStr = String(app_id).trim();
  if (!/^\d+$/.test(appIdStr)) {
    log('app_id 必须是纯数字（TapTap 游戏数字 ID），例如 58881。当前值看起来像 client_id 或 server_secret，请到 TapTap 游戏页 URL 中查看 app/ 后面的数字', 'err');
    process.exit(1);
  }
  // 版本号：优先从 config 读取，没有则从 build.gradle 读
  let version_code = config.version_code != null ? Number(config.version_code) : NaN;
  let version_name = config.version_name != null ? String(config.version_name).trim() : '';
  if (!Number.isInteger(version_code) || version_code < 0 || !version_name) {
    const fromGradle = readVersionFromBuildGradle();
    if (fromGradle) {
      version_code = Number.isNaN(version_code) || version_code < 0 ? fromGradle.versionCode : version_code;
      version_name = version_name || fromGradle.versionName;
      log(`版本从 build.gradle 同步: versionCode ${version_code}, versionName "${version_name}"`, 'info');
    } else {
      log('请在 taptap-upload.config.json 中填写 version_code、version_name，或保证 android/app/build.gradle 中有 versionCode/versionName', 'err');
      process.exit(1);
    }
  }
  return { ...config, client_id, server_secret, app_id: appIdStr, version_code, version_name };
}

function readVersionFromBuildGradle() {
  if (!existsSync(BUILD_GRADLE_PATH)) return null;
  const content = readFileSync(BUILD_GRADLE_PATH, 'utf-8');
  const codeMatch = content.match(/versionCode\s+(\d+)/);
  const nameMatch = content.match(/versionName\s+"([^"]+)"/);
  if (!codeMatch || !nameMatch) return null;
  return { versionCode: parseInt(codeMatch[1], 10), versionName: nameMatch[1] };
}

function randomNonce(len = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function computeSign(serverSecret, signParts) {
  const hmac = createHmac('sha256', serverSecret);
  hmac.update(signParts, 'utf8');
  return hmac.digest('base64');
}

async function getUploadParams(config, fileName) {
  const ts = Math.floor(Date.now() / 1000);
  const nonce = randomNonce(8);
  const query = new URLSearchParams({
    app_id: config.app_id,
    client_id: config.client_id,
    file_name: fileName,
  });
  const urlPathAndQuery = `/apk/v1/upload-params?${query.toString()}`;
  const headersPart = `x-tap-nonce:${nonce}\nx-tap-ts:${ts}`;
  const signParts = `GET\n${urlPathAndQuery}\n${headersPart}\n\n`;
  const sign = computeSign(config.server_secret, signParts);

  const url = `https://cloud.tapapis.cn${urlPathAndQuery}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Tap-Ts': String(ts),
      'X-Tap-Nonce': nonce,
      'X-Tap-Sign': sign,
    },
  });

  const body = await res.json();
  if (!body.success || !body.data) {
    log(body.message || body.errmsg || JSON.stringify(body), 'err');
    process.exit(1);
  }
  return body.data;
}

/**
 * 从 config 读取 version_code、version_name，仅自动递增 version_code 并写回 build.gradle 和 config。
 * version_name 仅手动在 config 中修改，脚本不自动更改。
 */
function bumpVersionAndSync(config) {
  if (!existsSync(BUILD_GRADLE_PATH)) {
    log('未找到 android/app/build.gradle', 'err');
    process.exit(1);
  }
  const prevCode = config.version_code;
  const nextCode = prevCode + 1;
  const versionName = config.version_name; // 仅使用 config 中的值，不自动递增

  // 写入 build.gradle（version_code 递增，version_name 与 config 一致）
  let content = readFileSync(BUILD_GRADLE_PATH, 'utf-8');
  content = content
    .replace(/versionCode\s+\d+/, `versionCode ${nextCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
  writeFileSync(BUILD_GRADLE_PATH, content, 'utf-8');

  // 写回 config：只更新 version_code，version_name 保持手动设置
  config.version_code = nextCode;
  const configOut = { ...config, version_code: nextCode };
  writeFileSync(CONFIG_PATH, JSON.stringify(configOut, null, 2) + '\n', 'utf-8');
  log(`version_code ${prevCode} -> ${nextCode}，version_name "${versionName}"（仅手动在 config 中修改）`, 'ok');
}

function buildRelease() {
  const isWin = process.platform === 'win32';
  const gradlew = isWin ? 'gradlew.bat' : 'gradlew';
  const gradlewPath = join(ANDROID_DIR, gradlew);

  if (!existsSync(gradlewPath)) {
    log('未找到 android/gradlew，请在项目根目录执行', 'err');
    process.exit(1);
  }

  log('正在执行: android assembleRelease ...');
  const ret = spawnSync(gradlew, ['assembleRelease'], {
    cwd: ANDROID_DIR,
    stdio: 'inherit',
    shell: isWin,
  });

  if (ret.status !== 0) {
    log('构建失败', 'err');
    process.exit(1);
  }
  log('构建成功', 'ok');

  if (!existsSync(APK_PATH)) {
    log('未找到 APK: ' + APK_PATH + '（可能未配置签名，请配置 keystore.properties 后重试）', 'err');
    process.exit(1);
  }
}

async function uploadApk(localPath, uploadData) {
  const { url, method, headers } = uploadData;
  const body = readFileSync(localPath);
  const res = await fetch(url, {
    method: method || 'PUT',
    headers: {
      ...headers,
      'Content-Length': String(body.length),
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    log(`上传失败 HTTP ${res.status}: ${text}`, 'err');
    process.exit(1);
  }
  log('上传成功，约 3–5 分钟后可在 TapTap 商店 >> 游戏资料 >> 商店资料 中看到该包', 'ok');
}

async function main() {
  console.log('');
  log('1/4 加载配置');
  const config = loadConfig();

  log('2/4 按 config 升级版本并写回 build.gradle');
  bumpVersionAndSync(config);

  log('3/4 构建 Release APK');
  buildRelease();

  const fileName = 'app-release.apk';
  log('4/4 获取上传参数并上传');
  const uploadData = await getUploadParams(config, fileName);
  await uploadApk(APK_PATH, uploadData);

  console.log('');
}

main().catch((e) => {
  log(e.message || String(e), 'err');
  process.exit(1);
});
