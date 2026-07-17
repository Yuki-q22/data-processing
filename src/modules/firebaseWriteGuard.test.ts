import { describe, expect, it } from 'vitest'
import {
  normalizeFirebaseWriteError,
  waitForFirebaseConnection,
  withTimeout,
} from './firebaseWriteGuard'

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

  it('waits through the initial disconnected event until Firebase connects', async () => {
    let unsubscribed = false

    await expect(
      waitForFirebaseConnection((onConnectionChange) => {
        onConnectionChange(false)
        const timer = setTimeout(() => onConnectionChange(true), 1)

        return () => {
          clearTimeout(timer)
          unsubscribed = true
        }
      }, 50)
    ).resolves.toBeUndefined()

    expect(unsubscribed).toBe(true)
  })

  it('stops listening when the Firebase connection times out', async () => {
    let unsubscribed = false

    await expect(
      waitForFirebaseConnection(() => () => {
        unsubscribed = true
      }, 5)
    ).rejects.toThrow('连接 Firebase 超时')

    expect(unsubscribed).toBe(true)
  })
})
