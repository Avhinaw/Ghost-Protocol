import { useEffect, useMemo, useState } from "react";
import { Activity, BookOpen, Plus, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";

type RadialItem = {
  label: string;
  shortLabel: string;
  href: string;
  icon: typeof Activity;
};

const items: RadialItem[] = [
  { label: "Operations", shortLabel: "OPS", href: "/", icon: Activity },
  { label: "New vault", shortLabel: "NEW", href: "/create", icon: Plus },
  { label: "Reviewer console", shortLabel: "REVIEW", href: "/review", icon: ShieldCheck },
  { label: "Protocol notes", shortLabel: "NOTES", href: "#protocol", icon: BookOpen },
];

function isCurrentRoute(location: string, href: string) {
  return href === "/" ? location === "/" : href.startsWith("#") ? false : location === href || (href === "/create" && location.startsWith("/vault/"));
}

export function RadialMenu() {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const currentIndex = useMemo(() => {
    const index = items.findIndex((item) => isCurrentRoute(location, item.href));
    return index >= 0 ? index : 0;
  }, [location]);
  const [selectedIndex, setSelectedIndex] = useState(currentIndex);

  useEffect(() => setSelectedIndex(currentIndex), [currentIndex]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (!open) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => (index + 1) % items.length);
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => (index - 1 + items.length) % items.length);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        navigate(items[selectedIndex]);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function navigate(item: RadialItem) {
    if (item.href.startsWith("#")) {
      setOpen(false);
      if (location !== "/") setLocation("/");
      window.setTimeout(() => document.querySelector(item.href)?.scrollIntoView({ behavior: "smooth" }), 0);
      return;
    }
    setSelectedIndex(items.indexOf(item));
    setOpen(false);
    setLocation(item.href);
  }

  return (
    <div className={`radial-menu${open ? " is-open" : ""}`}>
      <div className="radial-menu-orbit" aria-hidden="true" />
      <div className="radial-menu-spokes" aria-hidden="true" />
      <div className="radial-menu-items" aria-label="Primary navigation">
        {items.map((item, index) => {
          const Icon = item.icon;
          const active = isCurrentRoute(location, item.href);
          return (
            <button
              key={item.href}
              type="button"
              className={`radial-item radial-item-${index}${index === selectedIndex ? " is-selected" : ""}${active ? " is-active" : ""}`}
              onClick={() => navigate(item)}
              onMouseEnter={() => setSelectedIndex(index)}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={17} strokeWidth={1.5} />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="radial-menu-toggle"
        aria-expanded={open}
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="radial-menu-toggle-ring" aria-hidden="true" />
        <span className="radial-menu-toggle-label">{open ? "Close" : "Menu"}</span>
        <span className="radial-menu-toggle-key" aria-hidden="true">{open ? "ESC" : "TAB"}</span>
      </button>
      <span className="radial-menu-current" aria-live="polite">{items[selectedIndex]?.label}</span>
    </div>
  );
}
