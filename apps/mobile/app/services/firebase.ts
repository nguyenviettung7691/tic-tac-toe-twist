import '@nativescript/firebase-core'
import { firebase as coreFirebase } from '@nativescript/firebase-core'

let initializePromise: Promise<void> | null = null

function getFirebaseFactory(): (() => ReturnType<typeof coreFirebase>) | null {
  try {
    if (typeof coreFirebase === 'function') {
      return coreFirebase as unknown as () => ReturnType<typeof coreFirebase>
    }
    const required = require('@nativescript/firebase-core') as { default?: unknown; firebase?: () => ReturnType<typeof coreFirebase> }
    if (typeof required?.firebase === 'function') {
      return required.firebase
    }
    if (typeof required?.default === 'function') {
      return required.default as () => ReturnType<typeof coreFirebase>
    }
  } catch (err) {
    console.error('[firebase] core module load failed', err)
  }
  return null
}

export function initFirebase(): Promise<void> {
  if (initializePromise) {
    return initializePromise
  }
  const factory = getFirebaseFactory()
  if (!factory) {
    console.warn('[firebase] core module unavailable, skipping explicit initialization')
    initializePromise = Promise.resolve()
    return initializePromise
  }
  initializePromise = factory()
    .initializeApp()
    .then(() => {
      console.info('[firebase] initialized')
    })
    .catch((err) => {
      console.error('[firebase] initialization failed', err)
      throw err
    })

  return initializePromise
}
