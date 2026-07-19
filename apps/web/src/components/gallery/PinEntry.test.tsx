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

  it('distributes an OTP autofilled through a single change event across all boxes', () => {
    const onSubmit = vi.fn();
    render(<PinEntry onSubmit={onSubmit} />);
    const inputs = screen.getAllByLabelText(/digit/i);

    // OTP autofill can deliver the full code to the first input in one change event.
    fireEvent.change(inputs[0], { target: { value: '1234' } });

    expect(onSubmit).toHaveBeenCalledWith('1234');
  });

  it('clears stale trailing digits when a shorter code is pasted', () => {
    const onSubmit = vi.fn();
    render(<PinEntry onSubmit={onSubmit} />);
    const inputs = screen.getAllByLabelText(/digit/i) as HTMLInputElement[];

    // Fill all four, then paste a 2-digit code — the old digits 3 & 4 must clear.
    fireEvent.change(inputs[0], { target: { value: '9' } });
    fireEvent.change(inputs[1], { target: { value: '9' } });
    fireEvent.change(inputs[2], { target: { value: '9' } });
    fireEvent.change(inputs[3], { target: { value: '9' } });

    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => '12' },
    });

    expect(inputs[0].value).toBe('1');
    expect(inputs[1].value).toBe('2');
    expect(inputs[2].value).toBe('');
    expect(inputs[3].value).toBe('');
  });
});
