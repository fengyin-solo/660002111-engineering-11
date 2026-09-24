// 盲文点位表校验器：跑规则、打印结论、把结论写入本地文件（重启后仍可查）。
// 用法：node scripts/validate-braille.mjs [--report-dir <dir>]
// 通过退出码 0；存在问题退出码 1（供 pre-commit / npm script 直接使用）。

import createJiti from 'jiti'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(__dirname, '..')

const reportDirArg = process.argv.indexOf('--report-dir')
const reportDir = reportDirArg >= 0 && process.argv[reportDirArg + 1]
  ? resolve(process.cwd(), process.argv[reportDirArg + 1])
  : resolve(frontendDir, 'validation')
const jsonPath = resolve(reportDir, 'validation-report.json')
const mdPath = resolve(reportDir, 'validation-report.md')

// 纯 JS 转译 TS（不依赖平台相关的 esbuild 二进制）
const jiti = createJiti(import.meta.url)
const { validateBrailleTable } = await jiti.import(
  pathToFileURL(resolve(frontendDir, 'src/data/validationRules.ts')).href,
)

const report = validateBrailleTable()

// ---------- 终端输出 ----------
console.log(`盲文点位表校验  ${report.checkedAt}`)
console.log(`条目总数：${report.totalEntries}（期望 ${Object.values(report.coverage).reduce((n, c) => n + c.expected, 0)}）`)
if (!report.issues.length) {
  console.log('✅ 全部通过：条目齐全、点位无重复、反向查找一致')
} else {
  console.log(`❌ 校验未通过，共 ${report.issues.length} 项问题：`)
  for (const issue of report.issues) {
    const label = report.rules.find(rule => rule.code === issue.code)?.label ?? issue.code
    console.log(`  [${label}] ${issue.detail}`)
  }
}

// ---------- 本地落盘（JSON + Markdown 两份，重启可查） ----------
mkdirSync(reportDir, { recursive: true })
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

const lines = [
  '# 盲文点位表校验报告',
  '',
  `- 校验时间：${report.checkedAt}`,
  `- 结论：${report.passed ? '✅ 全部通过' : '❌ 未通过'}`,
  `- 条目总数：${report.totalEntries}`,
  '',
  '## 校验规则',
  '',
  '| 规则 | 判定内容 |',
  '| --- | --- |',
  ...report.rules.map(rule => `| ${rule.code}（${rule.label}） | ${rule.description} |`),
  '',
  '## 类目覆盖',
  '',
  '| 类目 | 期望条目数 | 实际条目数 |',
  '| --- | --- | --- |',
  ...Object.entries(report.coverage).map(([category, c]) => `| ${category} | ${c.expected} | ${c.actual} |`),
  '',
  ...(report.issues.length
    ? [
        `## 问题清单（${report.issues.length} 项）`,
        '',
        '| # | 规则 | 类目 | 字符 | 问题说明 |',
        '| --- | --- | --- | --- | --- |',
        ...report.issues.map((issue, i) =>
          `| ${i + 1} | ${issue.code} | ${issue.category} | ${issue.char === ' ' ? '␠' : issue.char} | ${issue.detail} |`),
        '',
      ]
    : ['## 问题清单', '', '无。三类判定全部通过。', '']),
]
writeFileSync(mdPath, lines.join('\n'), 'utf8')
console.log(`报告已写入：${jsonPath}`)
console.log(`报告已写入：${mdPath}`)

process.exitCode = report.passed ? 0 : 1
