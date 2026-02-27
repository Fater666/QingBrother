---
name: copyright-code-gen
description: 生成软著（软件著作权）申请所需的源代码文档。当用户提到"软著"、"软件著作权"、"copyright-code-gen"、"生成软著代码"、"源代码文档"时使用此 skill。
version: 1.0.0
disable-model-invocation: true
---

# 软著源代码生成

运行 `node scripts/copyright-gen.js` 生成软著申请所需的源代码文档。

可用参数：`--lines-per-page <n>` `--pages <n>` `--keep-imports` `--name <name>` `--output <dir>`

输出在 `copyright-output/` 目录：`前30页.txt`、`后30页.txt`、`统计信息.txt`

生成后提醒用户：复制到 Word，宋体小四号，行间距固定值20磅，页边距2cm。