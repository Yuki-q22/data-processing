import { afterEach, describe, expect, it } from 'vitest'
import { resolveControlLine } from './controlLine'
import { useRuleCenterStore } from '../stores/ruleCenterStore'

const originalRules = useRuleCenterStore.getState().controlLineRules

afterEach(() => {
  useRuleCenterStore.setState({ controlLineRules: originalRules })
})

describe('resolveControlLine', () => {
  it('指定年份时不会回退到其他年份规则', () => {
    useRuleCenterStore.setState({
      controlLineRules: [
        {
          year: '2025',
          province: '测试',
          categories: ['物理类'],
          batches: ['本科批'],
        },
      ],
    })

    expect(resolveControlLine('测试省', '物理类', '本科批', '2026')).toEqual({
      category: '',
      batch: '',
    })
    expect(resolveControlLine('测试省', '物理类', '本科批', '2025')).toEqual({
      category: '物理类',
      batch: '本科批',
    })
  })

  it('特殊招生批次不填写普通省控线', () => {
    useRuleCenterStore.setState({
      controlLineRules: [
        {
          year: '2025',
          province: '测试',
          categories: ['物理类'],
          batches: ['本科批'],
        },
      ],
    })

    expect(resolveControlLine('测试', '物理类', '本科提前批', '2025')).toEqual({
      category: '',
      batch: '',
    })
  })
})
