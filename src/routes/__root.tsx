import { Link, Outlet, createRootRoute } from "@tanstack/react-router";

const navItems = [
  { to: "/lobster-attack", label: "Lobster Attack" },
  { to: "/", label: "Bear Claw Inn" },
  { to: "/concierge", label: "Concierge" },
];

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand-mark" to="/">
          <span className="brand-kicker">Bear Claw Inn</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="nav-link"
              activeProps={{ className: "nav-link nav-link-active" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <Outlet />
      <footer className="site-footer">
        <p>
          Bear Claw Inn treats the host itself as the product. The model sees hostile input in one
          tier and acts in another.
        </p>
      </footer>
    </div>
  );
}
