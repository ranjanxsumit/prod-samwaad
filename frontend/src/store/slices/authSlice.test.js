import { describe, it, expect } from 'vitest'
import reducer, { setAuth, clearAuth } from './authSlice'

describe('auth slice reducer', () => {
  it('should return initial state', () => {
    const state = reducer(undefined, { type: '@@INIT' })
    expect(state).toEqual({ user: null, token: null })
  })

  it('should handle setAuth', () => {
    const action = setAuth({ token: 'abc', user: { id: '1', name: 'A' } })
    const state = reducer(undefined, action)
    expect(state.token).toBe('abc')
    expect(state.user).toEqual({ id: '1', name: 'A' })
  })

  it('should handle clearAuth', () => {
    const pre = { token: 't', user: { id: '1' } }
    const state = reducer(pre, clearAuth())
    expect(state).toEqual({ user: null, token: null })
  })
})
