import { createSlice } from '@reduxjs/toolkit'

const initialState = { user: null, token: null }

const slice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuth(state, action) {
      state.user = action.payload.user
      state.token = action.payload.token
    },
    clearAuth(state) {
      state.user = null; state.token = null
    }
  }
})

export const { setAuth, clearAuth } = slice.actions
export default slice.reducer
