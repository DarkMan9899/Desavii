# feedback-overlays

**Sprint 3 status:** `Spinner`, `Skeleton`, `EmptyState`, `Alert`,
`Modal`, `Drawer` implemented. `Toast`, `Notification Center`, `404
Page`, `500 Page` (COMPONENT_LIBRARY.md Part II Section 4) remain
scaffolded, not implemented — out of scope so far (404/500 are pages,
explicitly excluded from this sprint's scope; Toast/Notification Center
are unbuilt catalog entries).

`Alert` is not a COMPONENT_LIBRARY.md catalog entry — see
`Alert/Alert.jsx`'s file header for why it was built anyway (a
persistent inline banner, distinct from the ephemeral, auto-dismissing
Toast).

`Modal` and `Drawer` share all focus-trap/dismissal/portal behaviour via
the private `internal/Overlay` component and the `useFocusTrap` hook
(`../../hooks/useFocusTrap.js`) — neither re-implements it, per
COMPONENT_LIBRARY.md's own note that Drawer's behaviour is "identical"
to Modal's. `Overlay` also provides its dialog element through
`PortalContainerContext` (`../../hooks/usePortalContainer.js`), so a
floating panel opened inside a Modal/Drawer (DatePicker's calendar)
portals into the dialog rather than beneath it on `document.body`.

Each component, when implemented, follows the full specification in
`COMPONENT_LIBRARY.md` (Purpose, Props, States, Variants, Accessibility,
Animation, Responsive Behaviour, Dependencies, Where it is used) exactly
— one file per component, colocated with its `.module.scss`
(`FRONTEND_ARCHITECTURE.md` Section 9.1) and its own tests
(`FRONTEND_ARCHITECTURE.md` Section 35).

## Usage

```jsx
import {
  Spinner,
  Skeleton,
  EmptyState,
  Alert,
  Modal,
  Drawer,
} from '@desavii/ui/components/feedback-overlays';

<Spinner size="md" label="Processing payment" />

<Skeleton variant="text" count={3} />
<Skeleton variant="circle" width={40} height={40} />

<EmptyState
  title="No favorites yet"
  description="Save listings you like to find them here later."
  actionLabel="Browse listings"
  onAction={() => navigate('/search')}
/>

<Alert variant="danger" title="Payment failed" dismissible onDismiss={handleDismiss}>
  Your card was declined. Please try a different payment method.
</Alert>

<Modal isOpen={isOpen} onClose={close} title="Cancel booking" size="sm"
  footer={<Button variant="destructive" onClick={confirmCancel}>Cancel booking</Button>}>
  This can't be undone.
</Modal>

<Drawer isOpen={isOpen} onClose={close} title="Filters">
  {/* filter form */}
</Drawer>
```

`Modal`/`Drawer` both: full focus trap, close on `Escape` (unless
`preventClose`, or unless a nested popup already handled that Escape —
an open `Select` list or `DatePicker` calendar closes itself and calls
`preventDefault()`, so the first Escape closes only the popup and the
second closes the overlay), close on backdrop click (unless `closeOnBackdropClick=
{false}` or `preventClose`), restore focus to the triggering element on
close, and mark background `document.body` content `aria-hidden` while
open. `Drawer`'s `anchor="auto"` (default) renders as a bottom sheet
below the Tablet breakpoint and a right-side panel at Tablet and up.
