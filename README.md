# Bear Claw Inn

A React app built with Bun, Vite Plus, TanStack Router, and plain CSS.

The app turns the earlier concept into a navigable site with:

- a Lobby homepage
- a Concierge page showing the public hospitality surfaces

## Run

```bash
bun install
bun run dev
```

## Stack

- Bun for package management and scripts
- Vite Plus for the toolchain
- React with TypeScript
- TanStack Router with file-based routes
- Handwritten CSS only, no Tailwind

## Notes

- The current execution flow is an in-browser simulation, not a backend service
- Approval tokens are proof objects used to show boundary enforcement
- The core invariant remains the same: untrusted input, secrets, and side-effect authority never share the same path
# lobsterattack
