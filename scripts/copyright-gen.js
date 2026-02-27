#!/usr/bin/env node
/**
 * 软著源代码生成脚本
 * 用于生成中国软件著作权申请所需的源代码文档
 *
 * 用法: node scripts/copyright-gen.js [选项]
 *   --lines-per-page <n>  每页行数，默认 50
 *   --pages <n>           前后各多少页，默认 30
 *   --keep-imports        保留 import 语句
 *   --name <name>         软件名称
 *   --output <dir>        输出目录，默认 copyright-output
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ========== 配置 ==========

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

const EXCLUDE_DIRS = [
  'node_modules', 'dist', 'build', '.git', '.claude',
  'android/build', 'android/.gradle', 'android/app/build',
  'public', 'docs', '__pycache__',
];

const EXCLUDE_FILES = [
  'vite.config.ts', 'vite-env.d.ts', 'postcss.config.js',
  'capacitor.config.ts', 'tailwind.config.js', 'tailwind.config.ts',
];

// 文件排序优先级（越小越靠前）
const FILE_PRIORITY = [
  { pattern: /^components\/CombatView/, priority: 1 },
  { pattern: /^App\.tsx$/, priority: 2 },
  { pattern: /^components\/WorldMap/, priority: 3 },
  { pattern: /^components\/SquadManagement/, priority: 4 },
  { pattern: /^components\/CityView/, priority: 5 },
  { pattern: /^services\/mapGenerator/, priority: 6 },
  { pattern: /^services\/combatAI/, priority: 7 },
  { pattern: /^services\/worldMapAI/, priority: 8 },
  { pattern: /^constants\.ts$/, priority: 9 },
  { pattern: /^types\.ts$/, priority: 10 },
  { pattern: /^components\//, priority: 20 },
  { pattern: /^services\//, priority: 30 },
  { pattern: /^index\.tsx$/, priority: 40 },
  { pattern: /^scripts\//, priority: 90 },
  { pattern: /^electron\//, priority: 91 },
];

// ========== 命令行参数解析 ==========

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    linesPerPage: 50,
    pages: 30,
    keepImports: false,
    name: '',
    output: 'copyright-output',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--lines-per-page':
        config.linesPerPage = parseInt(args[++i], 10);
        break;
      case '--pages':
        config.pages = parseInt(args[++i], 10);
        break;
      case '--keep-imports':
        config.keepImports = true;
        break;
      case '--name':
        config.name = args[++i];
        break;
      case '--output':
        config.output = args[++i];
        break;
      case '--help':
        console.log(`
软著源代码生成脚本

用法: node scripts/copyright-gen.js [选项]

选项:
  --lines-per-page <n>  每页行数（默认 50）
  --pages <n>           前后各多少页（默认 30）
  --keep-imports        保留 import 语句
  --name <name>         软件名称（默认读取 package.json）
  --output <dir>        输出目录（默认 copyright-output）
  --help                显示帮助
`);
        process.exit(0);
    }
  }

  // 读取默认软件名称
  if (!config.name) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
      config.name = pkg.description || pkg.name || 'QingBrother';
    } catch {
      config.name = 'QingBrother';
    }
  }

  return config;
}

// ========== 文件扫描 ==========

function scanFiles(dir, relBase = '') {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.some(ex => relPath === ex || relPath.startsWith(ex + '/'))) continue;
      results.push(...scanFiles(path.join(dir, entry.name), relPath));
    } else if (entry.isFile()) {
      if (!EXTENSIONS.includes(path.extname(entry.name))) continue;
      if (EXCLUDE_FILES.includes(entry.name)) continue;
      results.push({ absPath: path.join(dir, entry.name), relPath });
    }
  }

  return results;
}

function getFilePriority(relPath) {
  const normalizedPath = relPath.replace(/\\/g, '/');
  for (const rule of FILE_PRIORITY) {
    if (rule.pattern.test(normalizedPath)) return rule.priority;
  }
  return 50; // 默认优先级
}

// ========== 代码清洗 ==========

function cleanCode(source, keepImports) {
  const lines = source.split('\n');
  const cleaned = [];
  let inBlockComment = false;

  for (let line of lines) {
    // 处理多行注释
    if (inBlockComment) {
      const endIdx = line.indexOf('*/');
      if (endIdx !== -1) {
        inBlockComment = false;
        line = line.substring(endIdx + 2);
        if (line.trim() === '') continue;
      } else {
        continue;
      }
    }

    // 检测多行注释开始
    const blockStart = line.indexOf('/*');
    if (blockStart !== -1) {
      const blockEnd = line.indexOf('*/', blockStart + 2);
      if (blockEnd !== -1) {
        // 同一行内的块注释，移除
        line = line.substring(0, blockStart) + line.substring(blockEnd + 2);
        if (line.trim() === '') continue;
      } else {
        // 块注释跨行
        line = line.substring(0, blockStart);
        inBlockComment = true;
        if (line.trim() === '') continue;
      }
    }

    // 移除单行注释（注意不要误删字符串中的 //）
    line = removeLineComment(line);

    // 跳过空行
    if (line.trim() === '') continue;

    // 可选：跳过 import 语句
    if (!keepImports) {
      const trimmed = line.trim();
      if (trimmed.startsWith('import ') && (trimmed.includes(' from ') || trimmed.includes("from'"))) continue;
      if (trimmed.startsWith('import {') || trimmed.startsWith('import type')) continue;
      // 多行 import 的后续行（以 } from 结尾）
      if (trimmed.startsWith('} from ')) continue;
    }

    cleaned.push(line);
  }

  return cleaned;
}

function removeLineComment(line) {
  let inString = false;
  let stringChar = '';
  let inTemplate = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === stringChar) inString = false;
      continue;
    }

    if (inTemplate) {
      if (ch === '\\') { i++; continue; }
      if (ch === '`') inTemplate = false;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === '`') {
      inTemplate = true;
      continue;
    }

    if (ch === '/' && next === '/') {
      return line.substring(0, i).trimEnd();
    }
  }

  return line;
}

// ========== 主流程 ==========

function main() {
  const config = parseArgs();
  const totalLines = config.linesPerPage * config.pages;

  console.log('========================================');
  console.log('  软著源代码生成工具');
  console.log('========================================');
  console.log(`软件名称: ${config.name}`);
  console.log(`每页行数: ${config.linesPerPage}`);
  console.log(`前后各:   ${config.pages} 页`);
  console.log(`保留import: ${config.keepImports}`);
  console.log('');

  // 1. 扫描文件
  const files = scanFiles(PROJECT_ROOT);
  files.sort((a, b) => getFilePriority(a.relPath) - getFilePriority(b.relPath));

  console.log(`扫描到 ${files.length} 个源代码文件:`);
  files.forEach(f => console.log(`  ${f.relPath}`));
  console.log('');

  // 2. 清洗代码并合并
  const allLines = [];
  const fileStats = [];

  for (const file of files) {
    const source = fs.readFileSync(file.absPath, 'utf-8');
    const cleaned = cleanCode(source, config.keepImports);

    if (cleaned.length === 0) continue;

    // 文件分隔标记
    allLines.push(`// ===== ${file.relPath} =====`);
    allLines.push(...cleaned);

    fileStats.push({
      file: file.relPath,
      originalLines: source.split('\n').length,
      cleanedLines: cleaned.length,
    });
  }

  console.log(`清洗后总行数: ${allLines.length}`);
  console.log(`需要行数: 前${totalLines}行 + 后${totalLines}行 = ${totalLines * 2}行`);
  console.log('');

  if (allLines.length < totalLines * 2) {
    console.log(`⚠ 注意: 清洗后代码总行数(${allLines.length})不足${totalLines * 2}行`);
    console.log(`  前后页面可能有重叠，建议开启 --keep-imports 或减少 --pages`);
    console.log('');
  }

  // 3. 提取前后页
  const frontLines = allLines.slice(0, totalLines);
  const backLines = allLines.slice(-totalLines);

  // 4. 格式化分页输出
  const outputDir = path.join(PROJECT_ROOT, config.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const frontText = formatPages(frontLines, config.linesPerPage, config.pages);
  const backText = formatPages(backLines, config.linesPerPage, config.pages);

  fs.writeFileSync(path.join(outputDir, '前30页.txt'), frontText, 'utf-8');
  fs.writeFileSync(path.join(outputDir, '后30页.txt'), backText, 'utf-8');

  // 5. 生成统计信息
  const statsText = generateStats(config, fileStats, allLines.length);
  fs.writeFileSync(path.join(outputDir, '统计信息.txt'), statsText, 'utf-8');

  console.log('========================================');
  console.log('  生成完成!');
  console.log('========================================');
  console.log(`输出目录: ${outputDir}`);
  console.log(`  - 前30页.txt (${frontLines.length} 行)`);
  console.log(`  - 后30页.txt (${backLines.length} 行)`);
  console.log(`  - 统计信息.txt`);
  console.log('');
  console.log('后续步骤:');
  console.log('  1. 将 txt 内容复制到 Word 文档');
  console.log('  2. 设置字体: 宋体/等线 小四号');
  console.log('  3. 行间距: 固定值 20磅');
  console.log('  4. 页边距: 上下左右各 2cm');
}

function formatPages(lines, linesPerPage, totalPages) {
  const output = [];
  const actualPages = Math.ceil(lines.length / linesPerPage);
  const pages = Math.min(actualPages, totalPages);

  for (let p = 0; p < pages; p++) {
    const start = p * linesPerPage;
    const end = Math.min(start + linesPerPage, lines.length);
    const pageLines = lines.slice(start, end);

    output.push(...pageLines);

    // 页间分隔（最后一页不加）
    if (p < pages - 1) {
      output.push('');
    }
  }

  return output.join('\n');
}

function generateStats(config, fileStats, totalCleanedLines) {
  const lines = [];
  lines.push(`软件名称: ${config.name}`);
  lines.push(`生成时间: ${new Date().toLocaleString('zh-CN')}`);
  lines.push(`每页行数: ${config.linesPerPage}`);
  lines.push(`前后各: ${config.pages} 页`);
  lines.push(`保留import: ${config.keepImports}`);
  lines.push('');
  lines.push(`清洗后总行数: ${totalCleanedLines}`);
  lines.push(`前${config.pages}页行数: ${Math.min(totalCleanedLines, config.linesPerPage * config.pages)}`);
  lines.push(`后${config.pages}页行数: ${Math.min(totalCleanedLines, config.linesPerPage * config.pages)}`);
  lines.push('');
  lines.push('文件统计:');
  lines.push('-'.repeat(60));
  lines.push(`${'文件路径'.padEnd(45)} 原始行数  清洗后`);
  lines.push('-'.repeat(60));

  let totalOriginal = 0;
  let totalCleaned = 0;

  for (const stat of fileStats) {
    const orig = String(stat.originalLines).padStart(6);
    const clean = String(stat.cleanedLines).padStart(6);
    lines.push(`${stat.file.padEnd(45)} ${orig}  ${clean}`);
    totalOriginal += stat.originalLines;
    totalCleaned += stat.cleanedLines;
  }

  lines.push('-'.repeat(60));
  lines.push(`${'合计'.padEnd(45)} ${String(totalOriginal).padStart(6)}  ${String(totalCleaned).padStart(6)}`);

  return lines.join('\n');
}

main();
