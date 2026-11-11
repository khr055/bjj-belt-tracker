import { useState } from 'react';

interface Props {
  /** Describes the item for screen readers, e.g. "Blue belt promotion". */
  label: string;
  onConfirm(): void;
}

/** Two-step delete: the first tap arms it, the second confirms. */
export function ConfirmDelete({ label, onConfirm }: Props) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        className="button button--small"
        aria-label={`Delete ${label}`}
        onClick={() => setArmed(true)}
      >
        Delete
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        className="button button--small button--danger"
        aria-label={`Confirm delete ${label}`}
        onClick={onConfirm}
      >
        Confirm delete
      </button>
      <button type="button" className="button button--small" onClick={() => setArmed(false)}>
        Keep
      </button>
    </>
  );
}
