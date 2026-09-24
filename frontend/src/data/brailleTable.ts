// 盲文点位表 —— 全项目唯一事实来源（single source of truth）
// 校验规则见 ./validationRules.ts，应用层映射/转换由 ../utils/braille.ts 派生。

export type BrailleCategory = 'letter' | 'digit' | 'space'

export interface BrailleEntry {
  /** 被编码的字符 */
  char: string
  /** 所属类目（letter=字母 / digit=数字 / space=空格） */
  category: BrailleCategory
  /**
   * 盲文方序列，每一方是该方被激活的圆点编号（合法值 1-6）。
   * 字母为单方；数字为「数字符号方 ⠼ + 对应字母方」两方；空格为单一空白方 [[]]。
   */
  cells: number[][]
}

/** 类目固定清单及展示名（新增类目才需改这里，判定规则不需要改） */
export const BRAILLE_CATEGORIES: readonly { id: BrailleCategory; label: string }[] = [
  { id: 'letter', label: '字母' },
  { id: 'digit', label: '数字' },
  { id: 'space', label: '空格' },
]

/**
 * 各类目应齐全的字符全集。
 * 新增字符时：把字符补进对应清单，并在 BRAILLE_ENTRIES 中补齐点位即可，
 * 校验规则（validationRules.ts）无需任何改动。
 */
export const EXPECTED_CHARS: Readonly<Record<BrailleCategory, readonly string[]>> = {
  letter: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  digit: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  space: [' '],
}

/** 26 个字母的单方点位（Braille Grade 1） */
const LETTER_CELLS: Record<string, number[]> = {
  A: [1], B: [1, 2], C: [1, 4], D: [1, 4, 5], E: [1, 5],
  F: [1, 2, 4], G: [1, 2, 4, 5], H: [1, 2, 5], I: [2, 4], J: [2, 4, 5],
  K: [1, 3], L: [1, 2, 3], M: [1, 3, 4], N: [1, 3, 4, 5], O: [1, 3, 5],
  P: [1, 2, 3, 4], Q: [1, 2, 3, 4, 5], R: [1, 2, 3, 5], S: [2, 3, 4], T: [2, 3, 4, 5],
  U: [1, 3, 6], V: [1, 2, 3, 6], W: [2, 4, 5, 6], X: [1, 3, 4, 6], Y: [1, 3, 4, 5, 6], Z: [1, 3, 5, 6],
}

/** 数字与对应字母方的关系（标准盲文：数字借用 A-J 点位） */
export const DIGIT_TO_LETTER: Record<string, string> = {
  '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E',
  '6': 'F', '7': 'G', '8': 'H', '9': 'I', '0': 'J',
}

/** 数字符号方（Braille number sign ⠼ = 圆点 3,4,5,6）：每个数字条目固定的前缀方 */
export const NUMBER_SIGN_CELL: number[] = [3, 4, 5, 6]

function buildEntries(): BrailleEntry[] {
  const entries: BrailleEntry[] = []
  for (const char of EXPECTED_CHARS.letter) {
    entries.push({ char, category: 'letter', cells: [LETTER_CELLS[char]] })
  }
  for (const char of EXPECTED_CHARS.digit) {
    // 数字 = 数字符号方 + 借用字母方（两方序列，与字母单方点位天然不冲突）
    entries.push({
      char,
      category: 'digit',
      cells: [[...NUMBER_SIGN_CELL], [...LETTER_CELLS[DIGIT_TO_LETTER[char]]]],
    })
  }
  entries.push({ char: ' ', category: 'space', cells: [[]] })
  return entries
}

export const BRAILLE_ENTRIES: readonly BrailleEntry[] = buildEntries()

/** 应用层使用的字符 → 盲文方序列映射（由条目表派生，勿手写第二份数据） */
export const BRAILLE_MAP: Record<string, number[][]> = Object.fromEntries(
  BRAILLE_ENTRIES.map(entry => [entry.char, entry.cells]),
)

export function getEntry(char: string): BrailleEntry | undefined {
  return BRAILLE_ENTRIES.find(entry => entry.char === char)
}

/** 点位序列的规范化字符串：方内去重、按圆点号升序，方间用 | 分隔 */
export function normalizeCells(cells: readonly (readonly number[])[]): string {
  return cells
    .map(cell => [...new Set(cell)].sort((a, b) => a - b).join('.'))
    .join('|')
}

/** 反向查找：按点位序列找回第一个匹配字符；找不到返回 undefined */
export function reverseLookupCells(cells: readonly (readonly number[])[]): string | undefined {
  const key = normalizeCells(cells)
  return BRAILLE_ENTRIES.find(entry => normalizeCells(entry.cells) === key)?.char
}

/** 点位序列的人类可读形式，如 [3,4,5,6][1]；空白方显示 [ ] */
export function formatCells(cells: readonly (readonly number[])[]): string {
  return cells.map(cell => `[${cell.length ? cell.join(',') : ' '}]`).join('')
}
