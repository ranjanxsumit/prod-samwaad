/// <reference types="vitest/globals" />
import '@testing-library/jest-dom'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import authReducer from '../store/slices/authSlice'
import App from '../App'

function renderWithStore(ui, { preloadedState } = {}) {
  const store = configureStore({ reducer: { auth: authReducer }, preloadedState })
  return render(<Provider store={store}><MemoryRouter initialEntries={["/chat"]}>{ui}</MemoryRouter></Provider>)
}

describe('ProtectedRoute behavior', () => {
  it('redirects to login if no token', () => {
    renderWithStore(<Routes><Route path="/chat" element={<App />} /></Routes>, { preloadedState: { auth: { token: null, user: null } } })
    // when App renders on /chat without token, Login should be shown
    expect(screen.getByText(/login/i)).toBeInTheDocument()
  })

  it('renders chat when token present', () => {
    renderWithStore(<Routes><Route path="/chat" element={<App />} /></Routes>, { preloadedState: { auth: { token: 'x', user: { name: 'A' } } } })
    expect(screen.getByText(/chat/i)).toBeInTheDocument()
  })
})
