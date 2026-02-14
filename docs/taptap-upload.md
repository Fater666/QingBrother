# TapTap 一键构建并上传 APK

## 使用前准备

1. 在 [TapTap 开放平台](https://developer.taptap.cn/) 开启应用配置，获取 **Client ID** 和 **Server Secret**。
2. 获取 TapTap 上架游戏的数字 **App ID**（如 58881）。
3. 在项目根目录下执行：
   ```bash
   cp scripts/taptap-upload.config.example.json scripts/taptap-upload.config.json
   ```
4. 编辑 `scripts/taptap-upload.config.json`，填入真实值：
   ```json
   {
     "client_id": "你的 Client ID",
     "server_secret": "你的 Server Secret",
     "app_id": "你的游戏数字 ID",
     "version_code": 1,
     "version_name": "1.0"
   }
   ```
   **版本号**：config 中 `version_code` 每次运行会自动 +1 并写回；`version_name` 仅手动在 config 里修改，脚本不会自动改。两者会同步到 `android/app/build.gradle`。若 config 中未写版本，会从 build.gradle 读取并同步。**不要**将 `taptap-upload.config.json` 提交到 Git（已加入 .gitignore）。

5. 确保已配置 Android 签名（`android/keystore.properties` 与 `android/app/release.jks`），否则构建出的为未签名包，无法安装与上架。

## 运行

在项目根目录执行：

```bash
npm run taptap:upload
```

或直接：

```bash
node scripts/upload-taptap.js
```

脚本会依次：

1. 读取 `scripts/taptap-upload.config.json`（含版本号；若无则从 build.gradle 同步）
2. 按 config 递增 `version_code`（`version_name` 仅用 config 中的值，不自动改），写回 config 并同步到 `android/app/build.gradle`
3. 执行 `android/gradlew assembleRelease` 构建 Release APK
4. 调用 TapTap 接口获取上传参数（含签算）并上传 `qingbrother-{versionName}.apk`

上传成功后，约 3–5 分钟可在 **商店 >> 游戏资料 >> 商店资料** 中看到该包，并作为版本资料提交审核。

## 签算说明

请求 TapTap 接口时需携带 `X-Tap-Ts`、`X-Tap-Nonce`、`X-Tap-Sign` 请求头，其中 `X-Tap-Sign` 为：

`Base64(HMAC-SHA256(Server Secret, SignParts))`

SignParts 格式：`{method}\n{url_path_and_query}\n{headers}\n{body}\n`，详见 [TapTap 上传文档](https://developer.taptap.cn/docs/sdk/upload/guide/)。
