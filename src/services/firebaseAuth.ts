import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth'
import { auth, firebaseConfigErrorMessage } from '../lib/firebase'

function getFirebaseAuth(): Auth {
  if (!auth) {
    throw new Error(
      firebaseConfigErrorMessage || 'Firebase 未初始化，请检查环境变量配置'
    )
  }

  return auth
}

export async function registerWithEmail(email: string, password: string) {
  const result = await createUserWithEmailAndPassword(
    getFirebaseAuth(),
    email,
    password
  )
  return result.user
}

export async function loginWithEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(
    getFirebaseAuth(),
    email,
    password
  )
  return result.user
}

export async function logout() {
  await signOut(getFirebaseAuth())
}

export function subscribeAuth(callback: (user: User | null) => void) {
  if (!auth) {
    callback(null)
    return () => undefined
  }

  return onAuthStateChanged(auth, callback)
}
