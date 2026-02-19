param(
    [ValidateSet('dev', 'release')]
    [string]$BuildType = 'dev'
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-ExternalCommand {
    param (
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter()]
        [string[]]$Arguments = @()
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        $argText = if ($Arguments.Count -gt 0) { " $($Arguments -join ' ')" } else { "" }
        throw "命令执行失败: $FilePath$argText (exit code: $LASTEXITCODE)"
    }
}

function Convert-ToUtf8NoBom {
    param (
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        return
    }

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $content = [System.IO.File]::ReadAllText($Path)
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($Path, $content, $utf8NoBom)
        Write-Host "已移除 BOM: $Path" -ForegroundColor Yellow
    }
}

function Invoke-Step {
    param (
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Action
    )

    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    & $Action
}

function Move-ApkToArchive {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourcePath,
        [Parameter(Mandatory = $true)]
        [string]$ArchiveDir
    )

    if (-not (Test-Path $SourcePath)) {
        return
    }

    if (-not (Test-Path $ArchiveDir)) {
        New-Item -ItemType Directory -Path $ArchiveDir -Force | Out-Null
    }

    $nameWithoutExt = [System.IO.Path]::GetFileNameWithoutExtension($SourcePath)
    $ext = [System.IO.Path]::GetExtension($SourcePath)
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $destFileName = "$nameWithoutExt-$timestamp$ext"
    $destPath = Join-Path $ArchiveDir $destFileName
    $counter = 1

    while (Test-Path $destPath) {
        $destFileName = "$nameWithoutExt-$timestamp-$counter$ext"
        $destPath = Join-Path $ArchiveDir $destFileName
        $counter++
    }

    Move-Item -Path $SourcePath -Destination $destPath -Force
    Write-Host "已归档旧包: $destFileName" -ForegroundColor Yellow
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$androidDir = Join-Path $projectRoot "android"

if ($BuildType -eq 'release') {
    $apkSubDir = "release"
    $apkPattern = "qingbrother-*.apk"
    $gradleTask = "assembleRelease"
} else {
    $apkSubDir = "debug"
    $apkPattern = "app-debug.apk"
    $gradleTask = "assembleDebug"
}
$apkOutputDir = Join-Path $androidDir "app\build\outputs\apk\$apkSubDir"
$apkPath = Join-Path $apkOutputDir $(if ($BuildType -eq 'release') { "qingbrother-placeholder.apk" } else { $apkPattern })
$oldApkDir = Join-Path $apkOutputDir "old_apk"
$buildStartTime = Get-Date

if (-not (Test-Path $androidDir)) {
    throw "未找到 android 目录，请先执行：npx cap add android"
}

Push-Location $projectRoot
try {
    Invoke-Step "Normalize potential BOM files" {
        Convert-ToUtf8NoBom (Join-Path $androidDir "gradlew.bat")
        Convert-ToUtf8NoBom (Join-Path $androidDir "app\build.gradle")
    }

    Invoke-Step "Build web assets (Vite)" {
        Invoke-ExternalCommand "npm.cmd" @("run", "build")
    }

    Invoke-Step "Sync Capacitor android project" {
        Invoke-ExternalCommand "npx.cmd" @("cap", "sync", "android")
    }

    Invoke-Step "Normalize generated Gradle files" {
        Convert-ToUtf8NoBom (Join-Path $androidDir "app\build.gradle")
    }

    Invoke-Step "Assemble Android $BuildType APK" {
        if ($BuildType -eq 'release') {
            Get-ChildItem (Join-Path $apkOutputDir "qingbrother-*.apk") -File -ErrorAction SilentlyContinue |
                ForEach-Object { Move-ApkToArchive -SourcePath $_.FullName -ArchiveDir $oldApkDir }
        } else {
            if (Test-Path $apkPath) {
                Move-ApkToArchive -SourcePath $apkPath -ArchiveDir $oldApkDir
            }
        }

        Push-Location $androidDir
        try {
            Invoke-ExternalCommand ".\gradlew.bat" @($gradleTask)
        }
        finally {
            Pop-Location
        }
    }
}
finally {
    Pop-Location
}

if ($BuildType -eq 'release') {
    $builtApk = Get-ChildItem (Join-Path $apkOutputDir "qingbrother-*.apk") -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($builtApk) { $apkPath = $builtApk.FullName }
}
if ((Test-Path $apkPath) -and ((Get-Item $apkPath).LastWriteTime -ge $buildStartTime)) {
    Write-Host ""
    Write-Host "打包成功" -ForegroundColor Green
    Write-Host "APK 路径: $apkPath"
}
else {
    $errPath = if ($BuildType -eq 'release') { Join-Path $apkOutputDir "qingbrother-*.apk" } else { $apkPath }
    throw "构建未产出新的 APK，请检查上方错误日志：$errPath"
}
