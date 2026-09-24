# solo-6600021: 盲文翻译与触觉学习器

## 技术栈
- Vue 3 + TypeScript + Vite + Pinia + Tailwind CSS + SVG + Vibration API

## 核心特性
1. **中英文→盲文实时翻译**：Braille Grade 1 编码，Unicode 盲文字符输出
2. **6 点阵 SVG 大尺寸渲染**：可交互点击选择盲文点阵
3. **Vibration API 触觉模拟**：答对/答错不同振动模式
4. **训练模式**：看字符选盲文，正确率统计，历史记录
5. **速查表**：26 字母 + 数字完整盲文对照
6. **可打印 PDF 导出**：翻译结果导出为文本文件

## 启动
```bash
cd frontend && npm install && npm run dev
```
（`postinstall` 会自动执行 `git config core.hooksPath githooks`，启用提交前校验钩子。）

## 字符点位表校验
点位表数据与校验规则集中在仓库根部的共用定义里，前端与校验脚本共用同一份数据：

- `shared/braille-map.json` —— 字符点位表（唯一事实来源）。字符映射为盲文方序列 `number[][]`；数字按标准盲文编码为数字号 ⠼ (3,4,5,6) + 字母方的双方序列，空格为 `[[]]`。
- `shared/braille-rules.mjs` —— 校验规则的唯一定义（数据驱动）。

判定规则（每条问题都标明分类、字符与点位）：

| 规则 ID | 判定内容 |
| --- | --- |
| `missing-entry` | 字母 A-Z、数字 0-9、空格三类条目必须齐全 |
| `duplicate-dots` | 任意两个字符不得共用同一组盲文方 |
| `reverse-mismatch` | 由点位反查必须能唯一回到原字符 |
| `structural` | 点号限 1-6、方内不重复、序列非空（保证前三类判定可靠） |

手动校验：
```bash
node scripts/validate-braille.mjs          # 仓库根
cd frontend && npm run validate:braille    # 等价入口
```
提交时 `githooks/pre-commit` 会自动执行，未通过则中止提交。

**新增字符只需补齐 `shared/braille-map.json` 的条目，判定规则无需改动**；若要新增字符类别（如标点），在 `braille-rules.mjs` 的 `REQUIRED_GROUPS` 追加一组即可。

校验结论落盘，重启后可查（已加入 `.gitignore`，仅存本地）：
- `validation-report/last-report.json` / `.md` —— 最近一次结论
- `validation-report/history/<时间戳>.json` / `.md` —— 历史归档
