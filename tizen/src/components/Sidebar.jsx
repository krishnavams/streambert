import { useState } from "react";
import { HomeIcon, SearchIcon, BookmarkIcon, SettingsIcon, FilmIcon } from "@components/Icons";
import logoUrl from "../../../public/logo.svg";

const TABS = [
  { id: "search", label: "Search", Icon: SearchIcon },
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "browse", label: "Browse", Icon: FilmIcon },
  { id: "library", label: "My List", Icon: BookmarkIcon },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];

export default function Sidebar({ current, onSelect }) {
  // :focus-within needs Chromium 60+, so track it by hand
  const [expanded, setExpanded] = useState(false);
  return (
    <nav
      className={`sidebar${expanded ? " expanded" : ""}`}
      data-nav-group
      data-nav-sidebar
      data-nav-axis="vertical"
      onFocus={() => setExpanded(true)}
      onBlur={() => setExpanded(false)}
    >
      <img className="sidebar-logo" src={logoUrl} alt="Streambert" />
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`sidebar-btn focusable${current === id ? " active" : ""}`}
          onClick={() => onSelect(id)}
        >
          <span className="sidebar-icon">
            <Icon />
          </span>
          <span className="sidebar-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
