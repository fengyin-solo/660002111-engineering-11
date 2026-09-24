// English Braille Grade 1 mapping.
// 点位表的唯一事实来源是 shared/braille-map.json（同时被提交前校验使用），
// 这里只做读取与转换，不再内联任何字符点位，避免两处数据不一致。
import brailleData from '../../../shared/braille-map.json'

/** 字符 -> 盲文方序列；数字为 [数字号, 字母方] 双方，空格为 [[]]。 */
export const BRAILLE_MAP = brailleData.entries as unknown as Record<string, number[][]>

/** 数字号 ⠼：其后一方按字母点位解释为数字。 */
export const NUMBER_SIGN_DOTS: number[] = [3, 4, 5, 6]

// Dot positions in 2x3 grid (col, row): 1=(0,0), 2=(0,1), 3=(0,2), 4=(1,0), 5=(1,1), 6=(1,2)
export const DOT_POSITIONS: Record<number, [number, number]> = {
  1: [0, 0], 2: [0, 1], 3: [0, 2],
  4: [1, 0], 5: [1, 1], 6: [1, 2],
}

/** 文本 -> 盲文方序列（结果已展平为一串方，可直接逐个渲染）。 */
export function textToBraille(text: string): number[][] {
  return text.toUpperCase().split('').flatMap(c => BRAILLE_MAP[c] ?? [[]])
}

const cellSig = (dots: number[]) => JSON.stringify([...dots].sort((a, b) => a - b))

/**
 * 单方反查（训练模式用）：只匹配单方条目（字母与空格），
 * 数字是双方序列，不会再被误反查成字母。
 */
export function brailleToText(dots: number[]): string {
  const target = cellSig(dots)
  for (const [char, cells] of Object.entries(BRAILLE_MAP)) {
    if (cells.length === 1 && cellSig(cells[0]) === target) return char
  }
  return '?'
}

/** 完整盲文方序列反查（支持数字号开头的双方序列），逐字符还原文本。 */
export function brailleCellsToText(cells: number[][]): string {
  const bySignature = new Map<string, string>()
  for (const [char, seq] of Object.entries(BRAILLE_MAP)) {
    bySignature.set(seq.map(cellSig).join('|'), char)
  }
  let out = ''
  let i = 0
  while (i < cells.length) {
    const two = i + 1 < cells.length ? `${cellSig(cells[i])}|${cellSig(cells[i + 1])}` : null
    if (two && bySignature.has(two)) {
      out += bySignature.get(two)
      i += 2
    } else {
      const one = bySignature.get(cellSig(cells[i]))
      out += one ?? '?'
      i += 1
    }
  }
  return out
}

export function dotsToUnicode(dots: number[]): string {
  if (!dots.length) return '⠀'
  let code = 0x2800
  for (const d of dots) code += Math.pow(2, d - 1)
  return String.fromCodePoint(code)
}
