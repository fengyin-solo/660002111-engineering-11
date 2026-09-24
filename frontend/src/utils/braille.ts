// 应用层转换函数：点位数据统一来自 data/brailleTable.ts，这里不再维护第二份表
import { BRAILLE_MAP, normalizeCells, formatCells } from '../data/brailleTable'

export type BrailleCells = number[][]

export { BRAILLE_MAP, normalizeCells, formatCells }

// Dot positions in 2x3 grid (col, row): 1=(0,0), 2=(0,1), 3=(0,2), 4=(1,0), 5=(1,1), 6=(1,2)
export const DOT_POSITIONS: Record<number, [number, number]> = {
  1: [0, 0], 2: [0, 1], 3: [0, 2],
  4: [1, 0], 5: [1, 1], 6: [1, 2],
}

/** 文本 → 盲文方序列（字符在表中缺失时输出单一空白方） */
export function textToBraille(text: string): BrailleCells {
  return text.toUpperCase().split('').map(char => {
    const entryCells = BRAILLE_MAP[char]
    return entryCells ? entryCells.map(cell => [...cell]) : [[]]
  }).flat()
}

/** 单方盲文 → 字符（字母/空格）；多方序列（如数字）应使用 data 表的反向查找 */
export function brailleToText(dots: number[]): string {
  const key = normalizeCells([dots])
  for (const [char, cells] of Object.entries(BRAILLE_MAP)) {
    if (normalizeCells(cells) === key) return char
  }
  return '?'
}

export function dotsToUnicode(dots: number[]): string {
  if (!dots.length) return '⠀'
  let code = 0x2800
  for (const d of dots) code += Math.pow(2, d - 1)
  return String.fromCodePoint(code)
}
