import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getDatabase, type Database } from 'firebase/database'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const requiredEnvMap = {
  VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
  VITE_FIREBASE_DATABASE_URL: firebaseConfig.databaseURL,
  VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
  VITE_FIREBASE_APP_ID: firebaseConfig.appId,
}

export const missingFirebaseEnvKeys = Object.entries(requiredEnvMap)
  .filter(([, value]) => !String(value ?? '').trim())
  .map(([key]) => key)

export const isFirebaseConfigured = missingFirebaseEnvKeys.length === 0

export const firebaseConfigErrorMessage = isFirebaseConfigured
  ? ''
  : `Firebase 环境变量未配置：${missingFirebaseEnvKeys.join('、')}。请根据 .env.example 创建 .env.local 后重启 npm run dev。`

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Database | null = null

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getDatabase(app)
} else {
  console.warn(firebaseConfigErrorMessage)
}

export { app, auth, db }
