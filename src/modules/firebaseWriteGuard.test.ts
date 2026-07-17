import { describe, expect, it } from 'vitest'
import { normalizeFirebaseWriteError, withTimeout } from './firebaseWriteGuard'

describe('firebase write guard', () => {
  it('returns a completed operation result', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'timeout')).resolves.toBe('ok')
  })

  it('rejects an operation that does not finish in time', async () => {
    await expect(
      withTimeout(new Promise(() => undefined), 5, 'Firebase 写入超时')
    ).rejects.toThrow('Firebase 写入超时')
  })

  it('turns permission errors into an actionable message', () => {
    expect(normalizeFirebaseWriteError(new Error('PERMISSION_DENIED')).message).toContain(
      'rule_center'
    )
  })
})
