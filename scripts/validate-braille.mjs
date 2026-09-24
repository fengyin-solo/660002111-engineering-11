#!/usr/bin/env node
/**
 * 盲文字符点位表校验入口。
 *
 * 用法：
 *   node scripts/validate-braille.mjs
 *
 * 规则全部来自 shared/braille-rules.mjs（共用定义）；
 * 数据来自 shared/braille-map.json。
 *
 * 结论落盘（重启后仍可查）：
 *   validation-report/last-report.json   最近一次结构化结论
 *   validation-report/last-report.md     最近一次可读结论
 *   validation-report/history/<时间戳>.json/.md  历史归档
 *
 * 退出码：0 全部通过；1 存在校验问题或数据无法加载。
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const DATA_FILE = join(repoRoot, 'shared', 'braille-map.json')
const RULES_FILE = join(repoRoot, 'shared', 'braille-rules.mjs')
const REPORT_DIR = join(repoRoot, 'validation-report')
const HISTORY_DIR = join(REPORT_DIR, 'history')

const { validateBrailleMap, REQUIRED_GROUPS, RULES } = await import(
  pathToFileURL(RULES_FILE).href
)

const pad = n => String(n).padStart(2, '0')
function timestamp(d = new Date()) {
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  )
}

const showChar = c => (c === ' ' ? '␠(空格)' : c)

function loadEntries() {
  const raw = readFileSync(DATA_FILE, 'utf8')
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || !parsed.entries || typeof parsed.entries !== 'object') {
    throw new Error('braille-map.json 缺少 entries 对象')
  }
  return /** @type {Record<string, number[][]>} */ (parsed.entries)
}

function renderMarkdown(report) {
  const lines = []
  lines.push('# 盲文字符点位表校验报告')
  lines.push('')
  lines.push(`- 校验时间：${report.time}`)
  lines.push(`- 数据文件：${report.dataFile}`)
  lines.push(`- 规则定义：${report.rulesFile}`)
  lines.push(`- 条目总数：${report.entryCount}`)
  lines.push(`- 结论：**${report.passed ? '全部通过 ✅' : '未通过 ❌'}**`)
  lines.push('')
  lines.push('## 规则与命中数')
  lines.push('')
  lines.push('| 规则 ID | 名称 | 说明 | 命中 |')
  lines.push('| --- | --- | --- | --- |')
  for (const r of report.rules) {
    lines.push(`| ${r.id} | ${r.name} | ${r.description} | ${report.counts[r.id] || 0} |`)
  }
  lines.push('')
  lines.push('## 必检范围')
  lines.push('')
  for (const g of report.requiredGroups) {
    lines.push(`- ${g.group}：${g.chars.map(showChar).join('、')}`)
  }
  lines.push('')

  if (report.issues.length) {
    lines.push(`## 问题明细（共 ${report.issues.length} 项）`)
    lines.push('')
    lines.push('| # | 规则 | 分类 | 字符 | 问题 |')
    lines.push('| --- | --- | --- | --- | --- |')
    report.issues.forEach((it, i) => {
      lines.push(
        `| ${i + 1} | ${it.ruleId} ${it.ruleName} | ${it.group ?? '—'} | ${showChar(it.char)} | ${it.detail.replace(/\|/g, '\\|')} |`
      )
    })
    lines.push('')
  } else {
    lines.push('## 三类问题均未发现：条目齐全、点位无重复、反向查找可回到原字符。')
    lines.push('')
  }
  return lines.join('\n')
}

function main() {
  const time = new Date()
  let report
  try {
    const entries = loadEntries()
    const result = validateBrailleMap(entries)
    report = {
      time: time.toISOString(),
      passed: result.passed,
      entryCount: result.entryCount,
      counts: result.counts,
      issues: result.issues,
      rules: RULES,
      requiredGroups: REQUIRED_GROUPS,
      dataFile: 'shared/braille-map.json',
      rulesFile: 'shared/braille-rules.mjs',
    }
  } catch (err) {
    report = {
      time: time.toISOString(),
      passed: false,
      entryCount: 0,
      counts: { 'data-load-error': 1 },
      issues: [
        {
          ruleId: 'data-load-error',
          ruleName: '数据无法加载',
          group: null,
          char: '',
          detail: String(err && err.message ? err.message : err),
        },
      ],
      rules: RULES,
      requiredGroups: REQUIRED_GROUPS,
      dataFile: 'shared/braille-map.json',
      rulesFile: 'shared/braille-rules.mjs',
    }
  }

  const md = renderMarkdown(report)
  mkdirSync(HISTORY_DIR, { recursive: true })
  const ts = timestamp(time)
  writeFileSync(join(REPORT_DIR, 'last-report.json'), JSON.stringify(report, null, 2) + '\n')
  writeFileSync(join(REPORT_DIR, 'last-report.md'), md)
  writeFileSync(join(HISTORY_DIR, `${ts}.json`), JSON.stringify(report, null, 2) + '\n')
  writeFileSync(join(HISTORY_DIR, `${ts}.md`), md)

  console.log(md)
  console.log(`报告已写入 validation-report/last-report.{{json,md}} 及 history/${ts}.*`)
  process.exitCode = report.passed ? 0 : 1
}

main()
