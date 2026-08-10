import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmDeleteDialog } from '../ConfirmDeleteDialog';

describe('ConfirmDeleteDialog', () => {
  it('usa "Elimina" e colore error di default (comportamento invariato per i call-site esistenti)', () => {
    render(<ConfirmDeleteDialog open title="t" description="d" onConfirm={vi.fn()} onCancel={vi.fn()} loading={false} />);
    expect(screen.getByText('Elimina')).toBeInTheDocument();
  });

  it('accetta confirmLabel/confirmColor personalizzati', () => {
    render(
      <ConfirmDeleteDialog
        open title="t" description="d" onConfirm={vi.fn()} onCancel={vi.fn()} loading={false}
        confirmLabel="Rigenera" confirmColor="warning"
      />
    );
    expect(screen.getByText('Rigenera')).toBeInTheDocument();
    expect(screen.queryByText('Elimina')).not.toBeInTheDocument();
  });
});
