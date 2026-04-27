export type DefaultRemarkTypeRule = {
  id: string
  keyword: string
  outputType: string
  priority: number
}

export const DEFAULT_REMARK_TYPE_RULES: DefaultRemarkTypeRule[] = [
  { id: 'r1', keyword: '中外合作', outputType: '中外合作办学', priority: 1 },
  { id: 'r2', keyword: '中外高水平大学生交流计划', outputType: '中外高水平大学生交流计划', priority: 2 },
  { id: 'r3', keyword: '学分互认联合培养项目', outputType: '学分互认联合培养项目', priority: 3 },
  { id: 'r4', keyword: '地方专项', outputType: '地方专项计划', priority: 4 },
  { id: 'r5', keyword: '国家专项', outputType: '国家专项计划', priority: 5 },
  { id: 'r6', keyword: '高校专项', outputType: '高校专项计划', priority: 6 },
  { id: 'r7', keyword: '艺术类', outputType: '艺术类', priority: 7 },
  { id: 'r8', keyword: '闽台合作', outputType: '闽台合作', priority: 8 },
  { id: 'r9', keyword: '预科', outputType: '预科', priority: 9 },

  // 定向培养军士必须排在“定向”前面
  { id: 'r10', keyword: '定向培养军士', outputType: '定向培养军士生', priority: 10 },
  { id: 'r11', keyword: '定向', outputType: '定向', priority: 11 },

  { id: 'r12', keyword: '护理类', outputType: '护理类', priority: 12 },
  { id: 'r13', keyword: '民族班', outputType: '民族班', priority: 13 },
  { id: 'r14', keyword: '联合办学', outputType: '联合办学', priority: 14 },
  { id: 'r15', keyword: '联办', outputType: '联合办学', priority: 15 },
  { id: 'r16', keyword: '建档立卡专项', outputType: '建档立卡专项', priority: 16 },
  { id: 'r17', keyword: '藏区专项', outputType: '藏区专项', priority: 17 },
  { id: 'r18', keyword: '少数民族紧缺人才培养专项', outputType: '少数民族紧缺人才培养专项', priority: 18 },
  { id: 'r19', keyword: '民语类及对等培养', outputType: '民语类及对等培养', priority: 19 },
  { id: 'r20', keyword: '优师计划', outputType: '优师计划', priority: 20 },
  { id: 'r21', keyword: '国家优师专项', outputType: '国家优师专项', priority: 21 },
  { id: 'r22', keyword: '优师专项', outputType: '优师专项', priority: 22 },
  { id: 'r23', keyword: '国家公费师范生', outputType: '国家公费师范生', priority: 23 },
  { id: 'r24', keyword: '公费师范', outputType: '公费师范生', priority: 24 },
  { id: 'r25', keyword: '中美121', outputType: '中美121项目', priority: 25 },
  { id: 'r26', keyword: '中俄实验班', outputType: '中俄实验班', priority: 26 },
  { id: 'r27', keyword: '校企合作', outputType: '校企合作', priority: 27 },
  { id: 'r28', keyword: '订单培养', outputType: '订单培养', priority: 28 },
  { id: 'r29', keyword: '订单班', outputType: '订单班', priority: 29 },
  { id: 'r30', keyword: '高本贯通', outputType: '高本贯通', priority: 30 },
  { id: 'r31', keyword: '国际班', outputType: '国际班', priority: 31 },
  { id: 'r32', keyword: '苏区专项', outputType: '苏区专项', priority: 32 },
  { id: 'r33', keyword: '中外联合培养', outputType: '中外联合培养', priority: 33 },
  { id: 'r34', keyword: '中外高水平大学学生交流计划', outputType: '中外高水平大学学生交流计划', priority: 34 },

  // 原规则没有 priority 35，保持原始优先级
  { id: 'r35', keyword: '威海校区', outputType: '威海校区', priority: 36 },
  { id: 'r36', keyword: '马来西亚校区', outputType: '马来西亚校区', priority: 37 },
  { id: 'r37', keyword: '马来西亚分校', outputType: '马来西亚分校', priority: 38 },
  { id: 'r38', keyword: '学分互认双学位联合培养', outputType: '学分互认双学位联合培养', priority: 39 },
  { id: 'r39', keyword: '本科国际课程教育项目', outputType: '本科国际课程教育项目', priority: 40 },
  { id: 'r40', keyword: '国际本科学术互认', outputType: '国际本科学术互认', priority: 41 },
  { id: 'r41', keyword: '国际课程项目', outputType: '国际课程项目', priority: 42 },
  { id: 'r42', keyword: '中英学分互认', outputType: '中英学分互认', priority: 43 },
  { id: 'r43', keyword: '中美学分互认', outputType: '中美学分互认', priority: 44 },
  { id: 'r44', keyword: '中外学分互认', outputType: '中外学分互认', priority: 45 },
  { id: 'r45', keyword: '中外双学士出国2加2', outputType: '中外合作办学', priority: 46 },
  { id: 'r46', keyword: '中法学分互认', outputType: '中法学分互认', priority: 47 },
  { id: 'r47', keyword: '招蒙古族考生', outputType: '招蒙古族考生', priority: 48 },
  { id: 'r48', keyword: '艺术专业', outputType: '艺术专业', priority: 49 },
  { id: 'r49', keyword: '沙河校区', outputType: '沙河校区', priority: 50 },
  { id: 'r50', keyword: '对口援疆', outputType: '对口援疆', priority: 51 },
  { id: 'r51', keyword: '南疆单列', outputType: '南疆单列计划', priority: 52 },
  { id: 'r52', keyword: '高收费', outputType: '高收费', priority: 53 },
  { id: 'r53', keyword: '楚怡工匠', outputType: '楚怡工匠', priority: 54 },
  { id: 'r54', keyword: '迪庆专项', outputType: '迪庆专项', priority: 55 },
  { id: 'r55', keyword: '联合培养', outputType: '联合培养', priority: 56 },
  { id: 'r56', keyword: '八省区对等协作计划', outputType: '八省区对等协作计划', priority: 57 },
  { id: 'r57', keyword: '中美人才培养计划121双学位项目', outputType: '中美人才培养计划121双学位项目', priority: 58 },
  { id: 'r58', keyword: '授予艺术学学士学位', outputType: '艺术类', priority: 59 },
  { id: 'r59', keyword: '授予艺术学学位', outputType: '艺术类', priority: 60 },
  { id: 'r60', keyword: '边防军人子女预科班', outputType: '边防军人子女预科班', priority: 61 },
  { id: 'r61', keyword: '预科班', outputType: '预科班', priority: 62 },
  { id: 'r62', keyword: '招少数民族考生', outputType: '招少数民族考生', priority: 63 },
  { id: 'r63', keyword: '国际本科学术互认课程', outputType: '国际本科学术互认课程', priority: 64 },
  { id: 'r64', keyword: '本科学术互认课程', outputType: '本科学术互认课程', priority: 65 },
  { id: 'r65', keyword: '招朝鲜族考生', outputType: '招朝鲜族考生', priority: 66 },
]

export const DEFAULT_LEGACY_REMARK_TYPE_RULES = DEFAULT_REMARK_TYPE_RULES.map(
  ({ keyword, outputType, priority }) => ({
    keyword,
    output: outputType,
    priority,
  })
)