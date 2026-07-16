import { describe, test, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DemoExpiredPage from '../pages/DemoExpiredPage';

describe('DemoExpiredPage', () => {
  test('renders the expiry message', () => {
    render(
      <MemoryRouter>
        <DemoExpiredPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/la tua demo è scaduta/i)).toBeInTheDocument();
  });

  test('CTA links to /prova-demo', () => {
    render(
      <MemoryRouter>
        <DemoExpiredPage />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /inizia una nuova demo/i });
    expect(link).toHaveAttribute('href', '/prova-demo');
  });

  test('offers a mailto contact fallback (no live API call)', () => {
    render(
      <MemoryRouter>
        <DemoExpiredPage />
      </MemoryRouter>
    );
    const mailLink = screen.getByRole('link', { name: /info@dataxiom\.it/i });
    expect(mailLink).toHaveAttribute('href', 'mailto:info@dataxiom.it');
  });
});
