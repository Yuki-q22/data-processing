export const FIREBASE_CONNECTION_TIMEOUT_MS = 8_000
export const FIREBASE_WRITE_TIMEOUT_MS = 15_000

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

export function normalizeFirebaseWriteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (/permission[_ -]?denied/i.test(message)) {
    return new Error(
      'Firebase 拒绝写入，请确认已发布数据库规则，并将 rule_center 的 .write 设置为“auth != null”。'
    )
  }

  if (/network|offline|disconnected/i.test(message)) {
    return new Error('当前无法连接 Firebase，请检查网络后再试。')
  }

  return error instanceof Error ? error : new Error(message || 'Firebase 写入失败')
}
