export type CharacterGender = '男' | '女' | '未知'

const SURNAMES = '赵 钱 孙 李 周 吴 郑 王 冯 陈 褚 卫 蒋 沈 韩 杨 朱 秦 尤 许 何 吕 施 张 孔 曹 严 华 金 魏 陶 姜 戚 谢 邹 喻 柏 窦 章 云 苏 潘 葛 奚 范 彭 郎 鲁 韦 昌 马 苗 凤 花 方 俞 任 袁 柳 鲍 史 唐 费 岑 薛 雷 贺 倪 汤 滕 罗 毕 郝 邬 安 常 乐 于 傅 齐 康 伍 余 元 孟 黄 穆 萧 尹 姚 邵 汪 毛 顾 陆 裴 楚 叶 温 莫 钟 徐 邱 骆 高 夏 蔡 田 樊 胡 凌 霍 欧阳 司马 诸葛 上官 夏侯 东方 独孤 南宫 宇文 慕容'.split(' ')

const MALE_HEAD_A = '子 景 承 明 远 长 玄 星 凌 云 北 南 江 川 知 修 昭 砚 怀 岁'.split(' ')
const MALE_HEAD_B = '安 辰 川 舟 霖 墨 霄 澜 逸 衡 昀 骁 渊 岑 聿 宸 朗 朔 骞 旻'.split(' ')
const FEMALE_HEAD_A = '清 浅 暮 朝 晚 昭 书 云 月 星 婉 语 见 知 安 若 沈 宁 容 玉'.split(' ')
const FEMALE_HEAD_B = '漪 雪 音 歌 枝 露 瑶 霜 绮 柔 阑 吟 筝 眠 棠 意 央 语 微 兰'.split(' ')
const NAME_TAILS = '安 辰 川 舟 霖 墨 霄 澜 逸 衡 昀 骁 渊 岑 聿 宸 朗 朔 骞 旻 昭 远 宁 之 白 青 临 风 尘 野 行 歌 书 言 然 景 明 阳 清 月 雪 音 瑶 霜 绮 柔 棠 意 央 微 兰 华 岚 晗 令 予 离 归 渡 潇 斐 怀 澄 溪 沅 念 慕 祈 望 舒 煜 铮 屿 砚 容 璟 珩 宇 宗 昊 霁 寒 初 夏 秋 冬 春 晴 影 洛 沉 霏 莺 萤 照 枝'.split(' ')

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

function combinations(headA: readonly string[], headB: readonly string[]): number {
  return SURNAMES.length * headA.length * headB.length * NAME_TAILS.length
}

export function characterNameCombinationCount(gender: Exclude<CharacterGender, '未知'>): number {
  return gender === '男' ? combinations(MALE_HEAD_A, MALE_HEAD_B) : combinations(FEMALE_HEAD_A, FEMALE_HEAD_B)
}

export function randomCharacterName(): { name: string; gender: Exclude<CharacterGender, '未知'> } {
  const gender = Math.random() < 0.5 ? '男' : '女'
  const [headA, headB] = gender === '男' ? [MALE_HEAD_A, MALE_HEAD_B] : [FEMALE_HEAD_A, FEMALE_HEAD_B]
  return { name: `${pick(SURNAMES)}${pick(headA)}${pick(headB)}${pick(NAME_TAILS)}`, gender }
}

export function parseCharacterGender(content: string): CharacterGender {
  const value = content.match(/^\s*性别[：:]\s*(男|女|未知)\s*$/m)?.[1]
  return value === '男' || value === '女' ? value : '未知'
}

export function setCharacterGender(content: string, gender: CharacterGender): string {
  if (/^\s*性别[：:].*$/m.test(content)) return content.replace(/^\s*性别[：:].*$/m, `性别：${gender}`)
  const roleLine = /^\s*角色[：:].*$/m
  if (roleLine.test(content)) return content.replace(roleLine, (line) => `${line}\n性别：${gender}`)
  return `性别：${gender}${content ? `\n${content}` : ''}`
}
