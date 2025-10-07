import { firebase } from '@nativescript/firebase-core'
import {
  GoogleAuthProvider,
  type IUser as FirebaseUser,
} from '@nativescript/firebase-auth'
import { GoogleSignin } from '@nativescript/google-signin'
import { firebaseClientConfig } from '~/config/firebase-client'

export interface AuthUser {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
  providerIds: string[]
  isAnonymous: boolean
}

export interface AuthState {
  user: AuthUser | null
  initializing: boolean
  loading: boolean
  error: string | null
}

type AuthListener = (state: AuthState) => void

const listeners = new Set<AuthListener>()
let currentState: AuthState = {
  user: null,
  initializing: true,
  loading: false,
  error: null,
}

let authListener: ((user: FirebaseUser | null) => void) | null = null
let googleConfigured = false
let googleConfigurePromise: Promise<void> | null = null

function getAuth() {
  return firebase().auth()
}

function cloneState(): AuthState {
  const { user } = currentState
  return {
    ...currentState,
    user: user ? { ...user } : null,
  }
}

function notify() {
  const snapshot = cloneState()
  listeners.forEach((listener) => listener(snapshot))
}

function setState(patch: Partial<AuthState>) {
  currentState = { ...currentState, ...patch }
  notify()
}

function ensureAuthListener() {
  if (authListener) {
    return
  }
  const auth = getAuth()
  authListener = (user) => {
    currentState = {
      ...currentState,
      user: mapUser(user),
      initializing: false,
    }
    notify()
  }
  auth.addAuthStateChangeListener(authListener)
}

function mapUser(user: FirebaseUser | null): AuthUser | null {
  if (!user) {
    return null
  }

  const providerIds = Array.isArray(user.providerData)
    ? user.providerData.map((info) => info.providerId).filter(Boolean)
    : []

  return {
    uid: user.uid,
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    photoURL: user.photoURL ?? null,
    providerIds,
    isAnonymous: !!user.anonymous,
  }
}

function formatError(error: unknown): string {
  if (!error) {
    return 'Unknown authentication error'
  }
  if (typeof error === 'string') {
    return error
  }
  const err = error as { message?: string; code?: string | number }
  const code = err.code !== undefined ? String(err.code).trim() : ''
  const message = err.message?.trim?.() ?? ''
  if (code === '10') {
    return 'Google sign-in is misconfigured for this build (status 10). Register your Android SHA-1 fingerprint in Firebase and download the updated google-services.json.'
  }
  if (code && message) {
    return `${code}: ${message}`
  }
  if (message) {
    return message
  }
  if (code) {
    return `Error ${code}`
  }
  return 'Unknown authentication error'
}

function isPlaceholder(value: string | undefined | null) {
  return !value || value.toUpperCase().includes('REPLACE')
}

async function configureGoogleOnce() {
  if (googleConfigured) {
    return
  }
  if (googleConfigurePromise) {
    return googleConfigurePromise
  }
  const clientId = firebaseClientConfig.googleWebClientId
  if (isPlaceholder(clientId)) {
    throw new Error('Google sign-in is not configured. Update firebaseClientConfig.googleWebClientId.')
  }
  googleConfigurePromise = GoogleSignin.configure({
    serverClientId: clientId,
    clientId,
    scopes: ['profile', 'email'],
  }).then(() => {
    googleConfigured = true
  })
  return googleConfigurePromise
}

function isCancellation(error: unknown) {
  if (!error) {
    return false
  }
  if (typeof error === 'string') {
    const lower = error.toLowerCase()
    return lower.includes('cancel') || lower.trim() === '12501'
  }
  const details = error as { message?: string; code?: string | number }
  const code = details.code
  if (code !== undefined && String(code).trim() === '12501') {
    return true
  }
  const message = details.message ?? ''
  const lowerMessage = message.toLowerCase()
  if (lowerMessage.includes('cancel')) {
    return true
  }
  if (message.includes('12501')) {
    return true
  }
  return false
}

export function initAuthStore() {
  ensureAuthListener()
}

export function subscribeToAuth(listener: AuthListener) {
  ensureAuthListener()
  listeners.add(listener)
  listener(cloneState())
  return () => {
    listeners.delete(listener)
  }
}

export function getAuthState(): AuthState {
  return cloneState()
}

export function clearAuthError() {
  if (currentState.error) {
    setState({ error: null })
  }
}

export async function registerWithEmail(email: string, password: string, displayName?: string) {
  ensureAuthListener()
  setState({ loading: true, error: null })
  try {
    const credential = await getAuth().createUserWithEmailAndPassword(email, password)
    if (displayName && credential?.user) {
      await credential.user.updateProfile({ displayName })
    }
    return mapUser(credential?.user ?? null)
  } catch (error) {
    const message = formatError(error)
    setState({ error: message })
    throw new Error(message)
  } finally {
    setState({ loading: false })
  }
}

export async function signInWithEmail(email: string, password: string) {
  ensureAuthListener()
  setState({ loading: true, error: null })
  try {
    const credential = await getAuth().signInWithEmailAndPassword(email, password)
    return mapUser(credential?.user ?? null)
  } catch (error) {
    const message = formatError(error)
    setState({ error: message })
    throw new Error(message)
  } finally {
    setState({ loading: false })
  }
}

export async function signInWithGoogle() {
  ensureAuthListener()
  setState({ loading: true, error: null })
  try {
    await configureGoogleOnce()
    const playServicesAvailable = await GoogleSignin.playServicesAvailable()
    if (!playServicesAvailable) {
      throw new Error('Google Play services are required for Google sign-in.')
    }
    const googleUser = await GoogleSignin.signIn()
    if (!googleUser || !googleUser.idToken) {
      if (!googleUser) {
        return null
      }
      throw new Error('Google sign-in was cancelled before acquiring credentials.')
    }
    const credential = GoogleAuthProvider.credential(googleUser.idToken, googleUser.accessToken)
    const result = await getAuth().signInWithCredential(credential)
    return mapUser(result?.user ?? null)
  } catch (error) {
    if (isCancellation(error)) {
      setState({ loading: false })
      return null
    }
    const message = formatError(error)
    setState({ error: message })
    throw new Error(message)
  } finally {
    setState({ loading: false })
  }
}


export async function updateDisplayName(displayName: string) {
  ensureAuthListener()
  const trimmed = (displayName || '').trim()
  if (!trimmed) {
    const message = 'Display name cannot be empty.'
    setState({ error: message })
    throw new Error(message)
  }
  const auth = getAuth()
  const user = auth.currentUser
  if (!user) {
    const message = 'You need to be logged in to update your profile.'
    setState({ error: message })
    throw new Error(message)
  }
  setState({ loading: true, error: null })
  try {
    await user.updateProfile({ displayName: trimmed })
    await user.reload()
    const refreshed = auth.currentUser ?? user
    const mapped = mapUser(refreshed)
    setState({ user: mapped })
    return mapped
  } catch (error) {
    const message = formatError(error)
    setState({ error: message })
    throw new Error(message)
  } finally {
    setState({ loading: false })
  }
}

export async function signOut() {
  ensureAuthListener()
  setState({ loading: true, error: null })
  try {
    const auth = getAuth()
    const activeUser = auth.currentUser
    console.log('[auth] signOut: begin', {
      hasCurrentUser: !!activeUser,
      uid: activeUser?.uid ?? null,
      providerIds: activeUser?.providerData?.map((info) => info?.providerId).filter(Boolean) ?? [],
      loading: currentState.loading,
    })

    await configureGoogleOnce().catch((error) => {
      console.warn('[auth] signOut: google configure warning', error)
      return undefined
    })

    const googleOutcome = await Promise.race([
      GoogleSignin.signOut()
        .then(() => 'success' as const)
        .catch((error) => {
          console.warn('[auth] signOut: google signOut warning', error)
          return 'error' as const
        }),
      new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), 5000)
      }),
    ])
    console.log('[auth] signOut: google signOut complete', { googleOutcome })

    await auth.signOut()
    console.log('[auth] signOut: firebase signOut complete')

    currentState = {
      ...currentState,
      user: null,
      loading: false,
      error: null,
    }
    notify()
    console.log('[auth] signOut: state cleared and listeners notified')
  } catch (error) {
    const message = formatError(error)
    console.error('[auth] signOut: failed', {
      message,
      raw: error,
    })
    setState({ error: message })
    throw new Error(message)
  } finally {
    const { loading } = currentState
    if (loading) {
      setState({ loading: false })
    }
    console.log('[auth] signOut: finalize', {
      loading: currentState.loading,
      user: currentState.user ? { uid: currentState.user.uid } : null,
    })
  }
}
