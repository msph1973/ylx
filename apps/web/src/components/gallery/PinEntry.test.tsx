import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PinEntry } from './PinEntry';

describe('PinEntry', () => {
  it('renders 4 digit inputs', () => {
    render(<PinEntry onSubmit={vi.fn()} />);
    const inputs = screen.getAllByLabelText(/digit/i);
    expect(inputs).toHaveLength(4);
  });

  it('calls onSubmit with complete PIN', () => {
    const onSubmit = vi.fn();
    render(<PinEntry onSubmit={onSubmit} />);
    const inputs = screen.getAllByLabelText(/digit/i);

    fireEvent.change(inputs[0], { target: { value: '1' } });
    fireEvent.change(inputs[1], { target: { value: '2' } });
    fireEvent.change(inputs[2], { target: { value: '3' } });
    fireEvent.change(inputs[3], { target: { value: '4' } });

    expect(onSubmit).toHaveBeenCalledWith('1234');
  });

  it('shows error message when provided', () => {
    render(<PinEntry onSubmit={vi.fn()} error="Invalid PIN" />);
    expect(screen.getByText('Invalid PIN')).toBeInTheDocument();
  });
});
