// 盲文点位表校验规则 —— 共用定义（校验脚本与提交前钩子都只引用本文件）
// 三类判定：
//   1. missing-entry  条目缺失：字母 / 数字 / 空格各类目应有的字符一个都不能少
//   2. duplicate-dots 点位重复：任何两个字符都不能共用同一组圆点
//   3. reverse-mismatch 反向对不上：按点位反向查找必须能回到原字符
//
// 后续新增字符时，只需在 brailleTable.ts 的 EXPECTED_CHARS / BRAILLE_ENTRIES
// 补齐数据，本文件不需要改动。

import {
  BRAILLE_CATEGORIES,
  EXPECTED_CHARS,
  BRAILLE_ENTRIES,
  normalizeCells,
  reverseLookupCells,
  formatCells,
  type BrailleCategory,
  type BrailleEntry,
} from './brailleTable'

export type IssueCode = 'missing-entry' | 'duplicate-dots' | 'reverse-mismatch'

export interface ValidationIssue {
  /** 问题类别（三类判定之一） */
  code: IssueCode
  /** 类目：letter / digit / space */
  category: BrailleCategory | 'unknown'
  /** 涉及的字符；缺失类问题指「该有却没有」的字符 */
  char: string
  /** 人类可读说明，明确点到是哪个字符、哪一项 */
  detail: string
}

export interface ValidationResult {
  passed: boolean
  checkedAt: string
  /** 本次判定的规则清单（规则集中定义的依据） */
  rules: Readonly<{ code: IssueCode; label: string; description: string }[]>
  totalEntries: number
  /** 各类目「期望字符数 / 实际条目数」 */
  coverage: Readonly<Record<BrailleCategory, { expected: number; actual: number }>>
  issues: ValidationIssue[]
}

export const VALIDATION_RULES: Readonly<{ code: IssueCode; label: string; description: string }[]> = [
  {
    code: 'missing-entry',
    label: '条目缺失',
    description: '字母、数字、空格三类应有的字符必须全部有条目，缺一个即不通过',
  },
  {
    code: 'duplicate-dots',
    label: '点位重复',
    description: '任何两个字符都不能共用同一组圆点（规范化后的方序列必须全局唯一）',
  },
  {
    code: 'reverse-mismatch',
    label: '反向对不上',
    description: '每个字符的点位序列经反向查找必须回到该字符本身',
  },
]

const VALID_DOT_NUMBERS = new Set([1, 2, 3, 4, 5, 6])
const charDisplay = (char: string): string => (char === ' ' ? '␠(空格)' : char)
const categoryLabel = (id: BrailleCategory): string =>
  BRAILLE_CATEGORIES.find(category => category.id === id)?.label ?? id

export function validateBrailleTable(now: Date = new Date()): ValidationResult {
  const issues: ValidationIssue[] = []

  // ---- 统计实际条目 ----
  const actualByCategory = new Map<BrailleCategory, BrailleEntry[]>()
  const orphanEntries: BrailleEntry[] = []
  for (const entry of BRAILLE_ENTRIES) {
    const expected = EXPECTED_CHARS[entry.category]
    if (expected && !expected.includes(entry.char)) {
      orphanEntries.push(entry)
      continue
    }
    const list = actualByCategory.get(entry.category) ?? []
    list.push(entry)
    actualByCategory.set(entry.category, list)
  }

  const coverage = Object.fromEntries(
    BRAILLE_CATEGORIES.map(({ id }) => [
      id,
      {
        expected: EXPECTED_CHARS[id].length,
        actual: (actualByCategory.get(id) ?? []).length,
      },
    ]),
  ) as ValidationResult['coverage']

  // ---- 规则 1：条目缺失（类目清单里有、条目表里没有；不属于该类目的多余条目也按缺失项报出） ----
  for (const { id, label } of BRAILLE_CATEGORIES) {
    const actualChars = new Set((actualByCategory.get(id) ?? []).map(entry => entry.char))
    for (const char of EXPECTED_CHARS[id]) {
      if (!actualChars.has(char)) {
        issues.push({
          code: 'missing-entry',
          category: id,
          char,
          detail: `${label}类条目缺失：字符「${charDisplay(char)}」在点位表中没有对应条目`,
        })
      }
    }
  }
  for (const entry of orphanEntries) {
    issues.push({
      code: 'missing-entry',
      category: 'unknown',
      char: entry.char,
      detail: `字符「${charDisplay(entry.char)}」不属于类目「${entry.category}」的期望字符清单，类目/字符对应关系错误`,
    })
  }

  // ---- 规则 2：点位重复（规范化方序列全局唯一） ----
  const seenByDots = new Map<string, BrailleEntry>()
  for (const entry of BRAILLE_ENTRIES) {
    const key = normalizeCells(entry.cells)
    const first = seenByDots.get(key)
    if (first) {
      issues.push({
        code: 'duplicate-dots',
        category: entry.category,
        char: entry.char,
        detail: `字符「${charDisplay(entry.char)}」(${categoryLabel(entry.category)}) 与字符「${charDisplay(first.char)}」(${categoryLabel(first.category)}) 共用同一组圆点 ${formatCells(entry.cells)}`,
      })
    } else {
      seenByDots.set(key, entry)
    }
  }

  // ---- 规则 3：反向对不上（按点位反查必须回到原字符） ----
  for (const entry of BRAILLE_ENTRIES) {
    const resolved = reverseLookupCells(entry.cells)
    if (resolved !== entry.char) {
      issues.push({
        code: 'reverse-mismatch',
        category: entry.category,
        char: entry.char,
        detail: `字符「${charDisplay(entry.char)}」的点位 ${formatCells(entry.cells)} 反向查找回到的是「${resolved === undefined ? '（查不到任何字符）' : charDisplay(resolved)}」，而非原字符`,
      })
    }
  }

  // ---- 附：点位值合法性（圆点号只能是 1-6、方序列不能为空），作为数据基础体检 ----
  for (const entry of BRAILLE_ENTRIES) {
    if (!entry.cells.length) {
      issues.push({
        code: 'reverse-mismatch',
        category: entry.category,
        char: entry.char,
        detail: `字符「${charDisplay(entry.char)}」的盲文方序列为空（至少应有一方）`,
      })
      continue
    }
    const badDots = entry.cells.flatMap(cell => cell).filter(dot => !VALID_DOT_NUMBERS.has(dot))
    if (badDots.length) {
      issues.push({
        code: 'reverse-mismatch',
        category: entry.category,
        char: entry.char,
        detail: `字符「${charDisplay(entry.char)}」存在非法圆点编号 ${badDots.join(', ')}（合法值为 1-6）`,
      })
    }
  }

  return {
    passed: issues.length === 0,
    checkedAt: now.toISOString(),
    rules: VALIDATION_RULES,
    totalEntries: BRAILLE_ENTRIES.length,
    coverage,
    issues,
  }
}
