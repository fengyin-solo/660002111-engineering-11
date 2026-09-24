/**
 * 盲文字符点位表 —— 校验规则（共用定义，唯一一份）
 *
 * 被 scripts/validate-braille.mjs 直接使用；提交前由
 * githooks/pre-commit 自动调用。规则本身是数据驱动的：
 * 后续新增字符时，只需在 shared/braille-map.json 补条目，
 * 判定逻辑不需要修改。
 *
 * 数据模型：
 *   字符 -> 盲文方序列 number[][]，每个盲文方是 1-6 号圆点的数组；
 *   空白方用 [] 表示（空格字符映射为 [[]]）。
 *
 * 三类必须被判定的问题：
 *   1. missing-entry      条目缺失：字母/数字/空格任一类目要求齐全
 *   2. duplicate-dots     点位重复：两个字符共用同一组盲文方
 *   3. reverse-mismatch   反向对不上：由点位反查回不到原字符
 * 另有 structural 一类用于挡掉畸形数据，保证前三类判定本身可靠。
 */

/**
 * 必检字符分组。要纳入新的字符类别（如标点），
 * 只需在此追加一组并在数据文件补条目。
 * @type {{ group: string, chars: string[] }[]}
 */
export const REQUIRED_GROUPS = [
  { group: '字母', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') },
  { group: '数字', chars: '0123456789'.split('') },
  { group: '空格', chars: [' '] },
]

/** 1-6 号圆点之外的点号一律非法。 */
export const VALID_DOTS = Object.freeze([1, 2, 3, 4, 5, 6])

/**
 * 规则清单（id / 名称 / 说明）。新增规则在这里登记，
 * 判定函数在 validateBrailleMap 中按 id 产出问题项。
 */
export const RULES = Object.freeze([
  { id: 'missing-entry', name: '条目缺失', description: '字母、数字、空格三类要求的字符条目必须齐全' },
  { id: 'duplicate-dots', name: '点位重复', description: '任意两个字符不得共用同一组盲文方序列' },
  { id: 'reverse-mismatch', name: '反向对不上', description: '由字符的盲文方序列反查，必须能唯一回到原字符' },
  { id: 'structural', name: '结构非法', description: '条目必须是盲文方数组的序列，圆点编号限 1-6，同一方内点号不得重复' },
])

/** 空白方签名；空格与未识别字符都落在这一组，但只有空格允许声明它。 */
const EMPTY_SIGNATURE = '[[]]'

/**
 * 把一个字符的盲文方序列规范化为稳定签名：
 * 每方内部点号升序，多方按顺序拼接。
 * @param {number[][]} cells
 * @returns {string}
 */
export function signatureOf(cells) {
  return '[' + cells.map(cell => '[' + [...cell].sort((a, b) => a - b).join(',') + ']').join(',') + ']'
}

const isInt = n => Number.isInteger(n)

/**
 * 结构校验：返回该条目下的全部结构问题（空数组表示结构合法）。
 * @param {string} char
 * @param {unknown} value
 * @returns {{ruleId:string, group:string|null, char:string, detail:string}[]}
 */
function structuralIssues(char, value) {
  const issues = []
  const push = detail =>
    issues.push({ ruleId: 'structural', group: groupOf(char), char, detail })

  if (!Array.isArray(value)) {
    push(`条目必须是盲文方数组（number[][]），实际为 ${typeof value}`)
    return issues
  }
  if (value.length === 0) {
    push('盲文方序列不能为空；空白字符应映射为 [[]]（一个空白方）')
    return issues
  }
  value.forEach((cell, ci) => {
    if (!Array.isArray(cell)) {
      push(`第 ${ci + 1} 方不是数组`)
      return
    }
    const seen = new Set()
    for (const d of cell) {
      if (!isInt(d) || d < 1 || d > 6) {
        push(`第 ${ci + 1} 方存在非法点号 ${String(d)}（只允许 1-6）`)
      } else if (seen.has(d)) {
        push(`第 ${ci + 1} 方内点号 ${d} 重复`)
      }
      seen.add(d)
    }
  })
  return issues
}

/** @param {string} char @returns {string|null} */
export function groupOf(char) {
  for (const { group, chars } of REQUIRED_GROUPS) {
    if (chars.includes(char)) return group
  }
  return null
}

const displayChar = char => (char === ' ' ? '␠(空格)' : char)

/**
 * 对点位表执行全部校验。
 * @param {Record<string, number[][]>} entries 字符 -> 盲文方序列
 * @returns {{
 *   passed: boolean,
 *   counts: Record<string, number>,
 *   issues: {ruleId:string, ruleName:string, group:string|null, char:string, detail:string}[],
 *   entryCount: number
 * }}
 */
export function validateBrailleMap(entries) {
  const issues = []

  // 规则 1：条目缺失（按三个必检分组逐字符核对）
  for (const { group, chars } of REQUIRED_GROUPS) {
    for (const char of chars) {
      if (!Object.prototype.hasOwnProperty.call(entries, char)) {
        issues.push({
          ruleId: 'missing-entry',
          ruleName: ruleName('missing-entry'),
          group,
          char,
          detail: `${group}类缺少条目 "${displayChar(char)}"`,
        })
      }
    }
  }

  // 先做结构校验；结构非法的条目不参与后续两类判定，避免误报
  const validEntries = /** @type {[string, number[][]][]} */ ([])
  for (const [char, value] of Object.entries(entries)) {
    const bad = structuralIssues(char, value)
    if (bad.length) {
      issues.push(...bad.map(b => ({ ...b, ruleName: ruleName(b.ruleId) })))
    } else {
      validEntries.push([char, /** @type {number[][]} */ (value)])
    }
  }

  // 字符 -> 签名
  const sigByChar = new Map(validEntries.map(([char, cells]) => [char, signatureOf(cells)]))

  // 规则 2：点位重复（同组签名被多个字符声明）
  const charsBySig = new Map()
  for (const [char, sig] of sigByChar) {
    if (!charsBySig.has(sig)) charsBySig.set(sig, [])
    charsBySig.get(sig).push(char)
  }
  for (const [sig, chars] of charsBySig) {
    if (chars.length > 1) {
      const names = chars.map(displayChar).join('、')
      for (const char of chars) {
        issues.push({
          ruleId: 'duplicate-dots',
          ruleName: ruleName('duplicate-dots'),
          group: groupOf(char),
          char,
          detail: `点位 ${sig} 与 ${chars.filter(c => c !== char).map(displayChar).join('、')} 重复（共用字符：${names}）`,
        })
      }
    }
  }

  // 反向映射：按声明顺序，每个签名反查到的第一个字符
  // （与 brailleToText 实际反查语义一致）
  const reverse = new Map()
  for (const [char, sig] of sigByChar) {
    if (!reverse.has(sig)) reverse.set(sig, char)
  }

  // 规则 3：反向对不上（由点位反查回不到原字符）。
  // 该判定独立于规则 2：即使点位重复导致反查落到别的字符，
  // 也要单独指出是哪个字符反查对不上。
  for (const [char, sig] of sigByChar) {
    const got = reverse.get(sig)
    if (got !== char) {
      issues.push({
        ruleId: 'reverse-mismatch',
        ruleName: ruleName('reverse-mismatch'),
        group: groupOf(char),
        char,
        detail: `点位 ${sig} 反查结果为 "${displayChar(got)}"，回不到 "${displayChar(char)}"`,
      })
    }
  }

  const counts = {}
  for (const rule of RULES) counts[rule.id] = 0
  for (const i of issues) counts[i.ruleId] = (counts[i.ruleId] || 0) + 1

  return { passed: issues.length === 0, counts, issues, entryCount: Object.keys(entries).length }
}

function ruleName(id) {
  return (RULES.find(r => r.id === id) || {}).name || id
}
