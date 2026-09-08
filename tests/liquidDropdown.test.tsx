/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import LiquidDropdown from '@/app/components/LiquidDropdown';

afterEach(() => {
  cleanup();
});

describe('LiquidDropdown Component', () => {
  it('renders duplicate option IDs without throwing React key collision warnings', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const options = [
      { id: 'ppv-nec-nijmegen-vs-excelsior', name: 'Stream Feed 1' },
      { id: 'ppv-nec-nijmegen-vs-excelsior', name: 'Stream Feed 2' },
      { id: 'ppv-nec-nijmegen-vs-excelsior', name: 'Stream Feed 3' },
    ];

    const onChange = vi.fn();

    render(
      <LiquidDropdown
        label="Select a feed..."
        title="Available Feeds"
        options={options}
        value="ppv-nec-nijmegen-vs-excelsior"
        onChange={onChange}
      />
    );

    // Open the dropdown
    const triggerBtn = screen.getByRole('button', { name: /Stream Feed 1/i });
    fireEvent.click(triggerBtn);

    // Check all options rendered in listbox
    const renderedOptions = screen.getAllByRole('option');
    expect(renderedOptions).toHaveLength(3);
    expect(screen.getAllByText('Stream Feed 1').length).toBeGreaterThan(0);
    expect(screen.getByText('Stream Feed 2')).toBeTruthy();
    expect(screen.getByText('Stream Feed 3')).toBeTruthy();

    // Verify console.error was not called with duplicate key warnings
    const duplicateKeyCalls = consoleErrorSpy.mock.calls.filter(args =>
      args.some(arg => typeof arg === 'string' && arg.includes('Encountered two children with the same key'))
    );
    expect(duplicateKeyCalls.length).toBe(0);

    consoleErrorSpy.mockRestore();
  });
});
