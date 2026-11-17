import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PodProvider } from '../app/PodContext'
import { DiagnosticsPage } from './DiagnosticsPage'

describe('DiagnosticsPage', () => {
  it('explains the iPhone browser requirement when Web Bluetooth is missing', () => {
    render(
      <MemoryRouter>
        <PodProvider>
          <DiagnosticsPage />
        </PodProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText('Diagnostik')).toBeInTheDocument()
    expect(screen.getByText(/Bluefy/i)).toBeInTheDocument()
    expect(screen.getByText(/Safari/i)).toBeInTheDocument()
    expect(screen.getByText(/Auth må ikke springes over|watchAdvertisements/i)).toBeTruthy()
  })

  it('does not silently connect a mock pod when Web Bluetooth is missing', async () => {
    render(
      <MemoryRouter>
        <PodProvider>
          <DiagnosticsPage />
        </PodProvider>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: /scan og tilslut/i }))
    expect(
      await screen.findByText(/Åbn appen via en HTTPS-adresse|findes ikke i denne browser/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/BlazePod Mock/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Ingen pod tilsluttet/i)).toBeInTheDocument()
  })

  it('can connect a simulated pod and show manufacturer data plus auth token', async () => {
    render(
      <MemoryRouter>
        <PodProvider>
          <DiagnosticsPage />
        </PodProvider>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: /simuleret pod/i }))
    await userEvent.click(screen.getByRole('button', { name: /scan og tilslut/i }))
    expect(await screen.findByText(/5A 01 DE AD BE EF/i, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText(/73 65 61 03 48 60 B6/i)).toBeInTheDocument()
    expect(screen.getByText(/90 %/)).toBeInTheDocument()
  })
})
