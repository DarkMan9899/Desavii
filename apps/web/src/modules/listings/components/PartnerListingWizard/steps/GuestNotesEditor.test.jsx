import { describe, test, expect, vi } from 'vitest';
import { useState } from 'react';
import PropTypes from 'prop-types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GuestNotesEditor from './GuestNotesEditor.jsx';
import { GUEST_NOTES_PER_KIND_MAX } from '../../../constants/guestNotes.js';

const ADD_NOT_ALLOWED = 'Ավելացնել «Արգելված է» ցանկում';
const ADD_BRING = 'Ավելացնել «Ինչ վերցնել» ցանկում';
const REMOVE = 'Հեռացնել';

// ContentStep owns the rows and their keys; this harness does the same.
function Harness({ initialRows, onChange }) {
  const [rows, setRows] = useState(initialRows);
  const [next, setNext] = useState(initialRows.length + 1);
  const update = (nextRows) => {
    setRows(nextRows);
    onChange(nextRows);
  };
  return (
    <GuestNotesEditor
      rows={rows}
      onRowsChange={update}
      onAddRow={(kind) => {
        update([...rows, { rowKey: next, kind, text: '' }]);
        setNext(next + 1);
      }}
    />
  );
}

Harness.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- test harness passthrough
  initialRows: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
};

describe('GuestNotesEditor', () => {
  test('adds, edits and removes a note within its own kind', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initialRows={[]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: ADD_NOT_ALLOWED }));
    await user.type(
      screen.getByRole('textbox', { name: 'Արգելված է' }),
      'Drones',
    );
    expect(onChange).toHaveBeenLastCalledWith([
      { rowKey: 1, kind: 'NOT_ALLOWED', text: 'Drones' },
    ]);

    await user.click(screen.getByRole('button', { name: REMOVE }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  test('each kind is capped on its own, like the API', () => {
    const fullBring = Array.from(
      { length: GUEST_NOTES_PER_KIND_MAX },
      (_, i) => ({ rowKey: i + 1, kind: 'BRING', text: `Item ${i}` }),
    );
    render(<Harness initialRows={fullBring} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: ADD_BRING })).toBeDisabled();
    expect(screen.getByRole('button', { name: ADD_NOT_ALLOWED })).toBeEnabled();
  });
});
