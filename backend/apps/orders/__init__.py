"""Orders domain — Sprint 8A.

Sprint 8 introduces the customer-to-kitchen order flow:

    Customer (public) -> POST /api/v1/public/orders
        -> Admin operator   -> POST /api/v1/admin/orders/{id}/status
        -> Kitchen screen   -> GET  /api/v1/admin/kitchen/tickets
        -> Customer         -> GET  /api/v1/public/orders/{order_number}/status

V1 keeps it intentionally simple:

* No real-time / WebSocket transport — admin + kitchen poll the admin
  endpoints; the public status view polls at 15s.
* No payments / taxes / discounts — the server computes the total
  from ``MenuItem.price`` snapshots stored on each ``OrderItem``.
* No customer account — phone + name identify the customer for V1
  (decision D-022 + OP-18 from SPRINT_8_PLAN.md).

Submodules in this app:

* ``models``    — ``Order`` + ``OrderItem``, snapshot pattern for menu items.
* ``services``  — order-number generator, total calculator,
                   status transition state machine + audit hook.
* ``views``     — 2 public + 4 admin endpoints (see ``urls_public`` /
                   ``urls_admin``).
* ``admin``     — Django admin registration for ops/debug visibility.
* ``tests``     — ~20 tests covering happy-path, validation, security,
                   transitions and tenant isolation.
"""
