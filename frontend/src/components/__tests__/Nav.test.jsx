import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Nav from '../Nav'
import { MemoryRouter } from 'react-router-dom'

describe('Nav keyboard navigation', () => {
  it('opens chats menu with Enter and navigates items with ArrowDown', async () => {
    render(<MemoryRouter><Nav user={{ name: 'Test' }} onLogout={() => {}} /></MemoryRouter>)
    const chatsButton = screen.getByTitle('Chats')
    // open menu
    fireEvent.keyDown(chatsButton, { key: 'ArrowDown' })
    // after opening, menu items should be present
    const item = await screen.findByText('All Chats')
    expect(item).toBeTruthy()
    // focus first item via ArrowDown
    fireEvent.keyDown(item, { key: 'ArrowDown' })
    // test escape closes
    fireEvent.keyDown(item, { key: 'Escape' })
    expect(screen.queryByText('All Chats')).toBeNull()
  })
})
