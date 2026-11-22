import { useEffect, useState } from "react";
import { getMyList, getHistory, getProgress, progressFraction } from "../lib/library";
import { Row } from "../components/ui";
import { ensureFocus } from "../nav/spatial";

export default function Library({ active, nav }) {
  const [myList, setMyList] = useState(getMyList);
  const [history, setHistory] = useState(getHistory);

  useEffect(() => {
    if (!active) return;
    setMyList(getMyList());
    setHistory(getHistory());
    setTimeout(ensureFocus, 0);
  }, [active]);

  const empty = !myList.length && !history.length;

  return (
    <div className="page library">
      <h1 className="page-title">My List</h1>
      {empty ? (
        <div className="empty">
          Nothing here yet. Add titles with “My List” on a title's page, and what you watch shows up here too.
        </div>
      ) : null}
      <Row title="Saved" items={myList} onSelect={nav.details} />
      <Row
        title="Recently watched"
        items={history}
        wide
        onSelect={(h) => nav.details(h, { season: h.season, episode: h.episode })}
        subtitleFor={(h) => (h.type === "tv" && h.season ? `S${h.season} · E${h.episode}` : null)}
        progressFor={(h) => progressFraction(getProgress(h, h.season, h.episode))}
      />
    </div>
  );
}
