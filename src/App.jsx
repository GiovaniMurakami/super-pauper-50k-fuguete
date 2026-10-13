import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchCardsByName } from "./scryfall";

const TABS = [
  { id: "meta", label: "Metagame" },
  { id: "matrix", label: "Confrontos" },
  { id: "top8", label: "Top 8" },
  { id: "standings", label: "Standings" },
  { id: "lists", label: "Listas" },
];

function pct(n, digits = 3) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Number(n).toFixed(digits)}%`;
}

/** Formato de OMW%/TGW%/OGW% (ratio 0–1 → percentual com 3 casas). */
function pctMelee(ratio, digits = 3) {
  if (ratio == null || Number.isNaN(Number(ratio))) return "—";
  return `${(Number(ratio) * 100).toFixed(digits)}%`;
}

function Bar({ value, max }) {
  const width = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div className="bar" title={`${value}`}>
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

function SortTh({ label, col, sort, onSort, className = "" }) {
  const active = sort.key === col;
  const arrow = !active ? "↕" : sort.dir === "asc" ? "↑" : "↓";
  return (
    <th className={className}>
      <button
        type="button"
        className={`sort-btn ${active ? "active" : ""}`}
        onClick={() => onSort(col)}
      >
        <span>{label}</span>
        <span className="sort-arrow" aria-hidden="true">
          {arrow}
        </span>
      </button>
    </th>
  );
}

const MAIN_TYPE_SECTIONS = [
  { key: "creature", title: "Criaturas" },
  { key: "instant", title: "Mágicas Instantâneas" },
  { key: "sorcery", title: "Feitiços" },
  { key: "other", title: "Outros" },
  { key: "land", title: "Terrenos" },
];

function classifyCardType(typeLine) {
  const t = String(typeLine || "").toLowerCase();
  if (t.includes("creature")) return "creature";
  if (t.includes("instant")) return "instant";
  if (t.includes("sorcery")) return "sorcery";
  if (t.includes("land")) return "land";
  return "other";
}

function sortDeckCards(cards, scryfall) {
  return [...(cards || [])].sort((a, b) => {
    const ca = scryfall.get(a.name);
    const cb = scryfall.get(b.name);
    const cmc = (ca?.cmc ?? 0) - (cb?.cmc ?? 0);
    if (cmc !== 0) return cmc;
    return String(a.name).localeCompare(String(b.name), "pt-BR", {
      sensitivity: "base",
    });
  });
}

function groupMaindeckByType(cards, scryfall) {
  const groups = {
    creature: [],
    instant: [],
    sorcery: [],
    other: [],
    land: [],
  };
  for (const card of cards || []) {
    const typeLine = scryfall.get(card.name)?.typeLine || "";
    groups[classifyCardType(typeLine)].push(card);
  }
  for (const key of Object.keys(groups)) {
    groups[key] = sortDeckCards(groups[key], scryfall);
  }
  return groups;
}

function DeckCardTile({ card, scryfall, onPreview }) {
  const info = scryfall.get(card.name);
  const image = info?.image;
  return (
    <button
      type="button"
      className="deck-card"
      onClick={() => image && onPreview({ name: card.name, image, qty: card.qty })}
      title={card.name}
    >
      {image ? (
        <img src={image} alt={card.name} loading="lazy" />
      ) : (
        <span className="deck-card-fallback">{card.name}</span>
      )}
      <span className="deck-card-qty">{card.qty}</span>
    </button>
  );
}

function DeckSection({ title, cards, scryfall, onPreview }) {
  const list = cards || [];
  if (!list.length) return null;
  const total = list.reduce((a, c) => a + c.qty, 0);
  return (
    <div className="deck-section">
      <h4>
        {title} ({total})
      </h4>
      <div className="deck-card-grid">
        {list.map((c) => (
          <DeckCardTile
            key={`${title}-${c.name}`}
            card={c}
            scryfall={scryfall}
            onPreview={onPreview}
          />
        ))}
      </div>
    </div>
  );
}

function DeckModal({ deck, onClose }) {
  const [scryfall, setScryfall] = useState(() => new Map());
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!deck) return undefined;
    const names = [
      ...(deck.maindeck || []).map((c) => c.name),
      ...(deck.sideboard || []).map((c) => c.name),
    ];
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    fetchCardsByName(names)
      .then((map) => {
        if (!cancelled) setScryfall(map);
      })
      .catch(() => {
        if (!cancelled) setScryfall(new Map());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deck]);

  useEffect(() => {
    if (!deck) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (preview) setPreview(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deck, preview, onClose]);

  const mainGroups = useMemo(
    () => groupMaindeckByType(deck?.maindeck, scryfall),
    [deck, scryfall]
  );
  const sideCards = useMemo(
    () => sortDeckCards(deck?.sideboard, scryfall),
    [deck, scryfall]
  );

  if (!deck) return null;

  const closePreview = (e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    setPreview(null);
  };

  return (
    <div
      className="deck-modal"
      onClick={() => {
        if (!preview) onClose();
      }}
      role="presentation"
    >
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Lista ${deck.nomeConsolidado}`}
      >
        <header>
          <div>
            <h3>{deck.nomeConsolidado}</h3>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              {deck.player}
              {deck.meleeDeckName ? ` · Melee: ${deck.meleeDeckName}` : ""}
              {loading ? " · carregando cartas…" : " · Scryfall"}
            </p>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            Fechar
          </button>
        </header>
        <div className="deck-type-stack">
          {MAIN_TYPE_SECTIONS.map((section) => (
            <DeckSection
              key={section.key}
              title={section.title}
              cards={mainGroups[section.key]}
              scryfall={scryfall}
              onPreview={setPreview}
            />
          ))}
          <DeckSection
            title="Sideboard"
            cards={sideCards}
            scryfall={scryfall}
            onPreview={setPreview}
          />
        </div>
      </div>
      {preview
        ? createPortal(
            <div
              className="card-preview"
              onMouseDown={closePreview}
              onClick={closePreview}
              role="presentation"
            >
              <figure
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <img src={preview.image} alt={preview.name} />
                <figcaption>
                  <strong>
                    {preview.qty}× {preview.name}
                  </strong>
                </figcaption>
              </figure>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function rateClass(rate) {
  if (rate == null) return "";
  if (rate > 55) return "rate-up";
  if (rate < 45) return "rate-down";
  return "rate-mid";
}

function matchupJogos(stats) {
  if (!stats) return 0;
  return Number(stats.jogos ?? stats.partidas ?? 0);
}

function pairingResultClass(res) {
  if (res === "W" || res === "BYE") return "pair-w";
  if (res === "L") return "pair-l";
  if (res === "D") return "pair-d";
  return "";
}

function PairingsHover({ name, pairings, children }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const anchorRef = useRef(null);
  const leaveTimer = useRef(null);

  const clearLeave = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };

  const show = () => {
    clearLeave();
    const el = anchorRef.current;
    if (!el || !pairings?.length) return;
    const rect = el.getBoundingClientRect();
    const tipW = 300;
    const tipH = Math.min(380, 52 + pairings.length * 34);
    let left = rect.right + 10;
    let top = rect.top;
    if (left + tipW > window.innerWidth - 8) left = rect.left - tipW - 10;
    if (left < 8) left = 8;
    if (top + tipH > window.innerHeight - 8) {
      top = window.innerHeight - tipH - 8;
    }
    if (top < 8) top = 8;
    setCoords({ top, left });
    setOpen(true);
  };

  const hide = () => {
    clearLeave();
    leaveTimer.current = setTimeout(() => setOpen(false), 140);
  };

  useEffect(() => () => clearLeave(), []);

  if (!pairings?.length) return children;

  return (
    <>
      <span
        ref={anchorRef}
        className="pairings-anchor"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
      >
        {children}
      </span>
      {open
        ? createPortal(
            <div
              className="pairings-tooltip"
              style={{ top: coords.top, left: coords.left }}
              onMouseEnter={clearLeave}
              onMouseLeave={hide}
              role="tooltip"
            >
              <div className="pairings-tooltip-title">
                Pareamentos · {name}
              </div>
              <ul className="pairings-list">
                {pairings.map((m, i) => (
                  <li key={`${m.r}-${m.opp || "bye"}-${i}`}>
                    <span className="pair-round">R{m.r}</span>
                    <span className="pair-opp">
                      {m.res === "BYE" ? (
                        "BYE"
                      ) : (
                        <>
                          vs {m.oppName || m.opp || "—"}
                          {m.oppArch ? (
                            <span className="pair-arch">{m.oppArch}</span>
                          ) : null}
                        </>
                      )}
                    </span>
                    <span className="pair-score">
                      {m.score}
                      <span className={pairingResultClass(m.res)}>
                        {" "}
                        ({m.res})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="pairings-footnote">
                Placar na perspectiva do jogador.
              </p>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function toggleSort(prev, key) {
  if (prev.key === key) {
    return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: "desc" };
}

function cmp(a, b, dir) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "string" || typeof b === "string") {
    const r = String(a).localeCompare(String(b), "pt-BR", {
      sensitivity: "base",
    });
    return dir === "asc" ? r : -r;
  }
  const r = a === b ? 0 : a < b ? -1 : 1;
  return dir === "asc" ? r : -r;
}

export default function App() {
  const [data, setData] = useState(null);
  const [decks, setDecks] = useState({});
  const [tab, setTab] = useState("meta");
  const [q, setQ] = useState("");
  const [metaMin, setMetaMin] = useState("0");
  const [minGames, setMinGames] = useState("0");
  const [onlyDay2, setOnlyDay2] = useState(false);
  const [onlyTop8, setOnlyTop8] = useState(false);
  const [archFilter, setArchFilter] = useState("");
  const [sortMeta, setSortMeta] = useState({ key: "copias", dir: "desc" });
  const [sortStandings, setSortStandings] = useState({
    key: "rank",
    dir: "asc",
  });
  const [sortLists, setSortLists] = useState({ key: "rank", dir: "asc" });
  const [sortMatrix, setSortMatrix] = useState({ key: "copias", dir: "desc" });
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch("./data/tournament.json").then((r) => r.json()),
      fetch("./data/decks.json").then((r) => r.json()),
    ])
      .then(([t, d]) => {
        setData(t);
        setDecks(d);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const archetypes = data?.archetypes || [];

  const filteredArch = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const min = Number(metaMin) || 0;
    let list = archetypes.filter(
      (a) =>
        (!needle || a.nome.toLowerCase().includes(needle)) &&
        Number(a.metaPct) >= min &&
        (!onlyDay2 || a.day2 > 0) &&
        (!onlyTop8 || a.top8 > 0)
    );
    const { key, dir } = sortMeta;
    list = [...list].sort((a, b) => {
      const av =
        key === "nome"
          ? a.nome
          : key === "winrate"
            ? Number(a.winrate) || 0
            : Number(a[key]) || 0;
      const bv =
        key === "nome"
          ? b.nome
          : key === "winrate"
            ? Number(b.winrate) || 0
            : Number(b[key]) || 0;
      return cmp(av, bv, dir) || cmp(a.nome, b.nome, "asc");
    });
    return list;
  }, [archetypes, q, metaMin, onlyDay2, onlyTop8, sortMeta]);

  const maxCopies = useMemo(
    () => Math.max(1, ...filteredArch.map((a) => a.copias), 1),
    [filteredArch]
  );

  const matrixArch = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const min = Number(metaMin) || 0;
    let list = archetypes.filter(
      (a) =>
        a.nome !== "Outros" &&
        a.slug !== "outros" &&
        (!needle || a.nome.toLowerCase().includes(needle)) &&
        Number(a.metaPct) >= min
    );
    const { key, dir } = sortMatrix;
    list = [...list].sort((a, b) => {
      const jogos = (x) =>
        Number(x.games) ||
        (x.matchups || []).reduce((s, m) => s + matchupJogos(m), 0);
      const wr = (x) =>
        x.gameWinrate != null ? Number(x.gameWinrate) : Number(x.winrate) || 0;
      const av =
        key === "nome"
          ? a.nome
          : key === "jogos" || key === "partidas"
            ? jogos(a)
            : key === "winrate"
              ? wr(a)
              : Number(a.copias) || 0;
      const bv =
        key === "nome"
          ? b.nome
          : key === "jogos" || key === "partidas"
            ? jogos(b)
            : key === "winrate"
              ? wr(b)
              : Number(b.copias) || 0;
      return cmp(av, bv, dir) || cmp(a.nome, b.nome, "asc");
    });
    return list;
  }, [archetypes, q, metaMin, sortMatrix]);

  const matchupLookup = useMemo(() => {
    const map = new Map();
    for (const a of archetypes) {
      const inner = new Map();
      for (const m of a.matchups || []) inner.set(m.nome, m);
      map.set(a.nome, inner);
    }
    return map;
  }, [archetypes]);

  const filteredPlayers = useMemo(() => {
    const list = data?.players || [];
    const needle = q.trim().toLowerCase();
    const arch = archFilter.trim().toLowerCase();
    return list.filter((p) => {
      if (onlyDay2 && !p.day2) return false;
      if (onlyTop8 && !(p.standing?.rank && p.standing.rank <= 8)) return false;
      if (arch && !(p.nomeConsolidado || "").toLowerCase().includes(arch))
        return false;
      if (!needle) return true;
      return [p.displayName, p.username, p.nomeConsolidado, p.meleeDeckName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [data, q, archFilter, onlyDay2, onlyTop8]);

  const sortedStandings = useMemo(() => {
    const standings = data?.standings || [];
    const players = data?.players || [];
    const byUser = new Map(
      players
        .filter((p) => p.username)
        .map((p) => [String(p.username).toLowerCase(), p])
    );
    const byDeck = new Map(
      players.filter((p) => p.decklistId).map((p) => [p.decklistId, p])
    );
    const needle = q.trim().toLowerCase();
    const arch = archFilter.trim().toLowerCase();
    const { key, dir } = sortStandings;

    let rows = standings.map((s) => {
      const p =
        byUser.get(String(s.username || "").toLowerCase()) ||
        byDeck.get(s.decklistId);
      return {
        rank: s.rank,
        name: s.name,
        username: s.username,
        decklistId: s.decklistId || p?.decklistId,
        decklistName: s.decklistName || p?.meleeDeckName || "",
        nomeConsolidado: p?.nomeConsolidado || "",
        deckDisplay:
          p?.nomeConsolidado || s.decklistName || p?.meleeDeckName || "",
        matchRecord: s.matchRecord,
        gameRecord: s.gameRecord,
        points: s.points,
        omw: s.omw,
        tgw: s.tgw,
        ogw: s.ogw,
        day2: Boolean(p?.day2),
        status: s.status,
      };
    });

    rows = rows.filter((r) => {
      if (onlyDay2 && !r.day2) return false;
      if (onlyTop8 && !(r.rank && r.rank <= 8)) return false;
      if (
        arch &&
        !(r.nomeConsolidado || "").toLowerCase().includes(arch) &&
        !(r.decklistName || "").toLowerCase().includes(arch)
      ) {
        return false;
      }
      if (!needle) return true;
      return [r.name, r.username, r.decklistName, r.nomeConsolidado]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });

    return [...rows].sort((a, b) => {
      const pick = (r) => {
        if (key === "name") return r.name || "";
        if (key === "decklist") return r.deckDisplay || r.nomeConsolidado || r.decklistName || "";
        if (key === "matchRecord") return r.matchRecord || "";
        if (key === "gameRecord") return r.gameRecord || "";
        if (key === "points") return r.points ?? 0;
        if (key === "omw") return r.omw ?? 0;
        if (key === "tgw") return r.tgw ?? 0;
        if (key === "ogw") return r.ogw ?? 0;
        return r.rank ?? 999;
      };
      return cmp(pick(a), pick(b), dir) || cmp(a.rank, b.rank, "asc");
    });
  }, [data, q, archFilter, onlyDay2, onlyTop8, sortStandings]);

  const sortedLists = useMemo(() => {
    const { key, dir } = sortLists;
    return [...filteredPlayers]
      .filter((p) => p.decklistId)
      .sort((a, b) => {
        const pick = (p) => {
          if (key === "name") return p.displayName || p.playerName || "";
          if (key === "archetype") return p.nomeConsolidado || "";
          if (key === "melee") return p.meleeDeckName || "";
          return p.standing?.rank ?? 999;
        };
        return cmp(pick(a), pick(b), dir);
      });
  }, [filteredPlayers, sortLists]);

  const openDeck = (decklistId) => {
    if (!decklistId || !decks[decklistId]) return;
    setSelectedDeck(decks[decklistId]);
  };

  const resetFilters = () => {
    setQ("");
    setMetaMin("0");
    setMinGames("0");
    setOnlyDay2(false);
    setOnlyTop8(false);
    setArchFilter("");
  };

  if (error) {
    return (
      <div className="app">
        <p>Erro ao carregar dados: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app">
        <p className="muted">Carregando…</p>
      </div>
    );
  }

  const t = data.tournament;
  const bracket = data.bracket || {};
  const minJogos = Number(minGames) || 0;

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-stage" aria-hidden="true">
          <img
            className="hero-photo"
            src="/brand/filipe-primo.jpg"
            alt=""
          />
          <div className="hero-veil" />
        </div>
        <div className="hero-copy">
          <img
            className="brand-mark"
            src="/brand/fuguete-logo.jpg"
            alt="Fuguete Pauper"
            width="160"
            height="160"
          />
          <h1>Super Pauper 50K</h1>
          <p>Metagame e confrontos da Fuguete Edition.</p>
          <div className="hero-cta">
            <button
              type="button"
              className="cta-primary"
              onClick={() => {
                setTab("meta");
                resetFilters();
                // nav sempre existe; #metagame só após o render da aba
                document
                  .getElementById("site-nav")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
                window.setTimeout(() => {
                  document
                    .getElementById("metagame")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 80);
              }}
            >
              Ver metagame
            </button>
            <a
              className="cta-ghost"
              href={t.source}
              target="_blank"
              rel="noreferrer"
            >
              Abrir no Melee
            </a>
          </div>
        </div>
      </header>

      <div className="event-strip" aria-label="Resumo do evento">
        <span>
          <strong>{t.players}</strong> jogadores
        </span>
        <span>
          <strong>{t.swissRounds}</strong> swiss
        </span>
        <span>
          Day2 <strong>{t.day2Cut}</strong>
        </span>
        <span>
          Campeão <strong>{t.champion}</strong>
        </span>
      </div>

      <nav id="site-nav" className="tabs" aria-label="Seções">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-selected={tab === item.id}
            onClick={() => {
              setTab(item.id);
              resetFilters();
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {(tab === "meta" ||
        tab === "matrix" ||
        tab === "standings" ||
        tab === "lists") && (
        <div className="filters">
          <label className="field grow">
            Buscar
            <input
              className="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                tab === "meta" || tab === "matrix"
                  ? "Arquétipo…"
                  : "Jogador ou deck…"
              }
            />
          </label>
          {(tab === "meta" || tab === "matrix") && (
            <label className="field">
              Meta mín.
              <span className="select-wrap">
                <select
                  value={metaMin}
                  onChange={(e) => setMetaMin(e.target.value)}
                >
                  <option value="0">Todos</option>
                  <option value="1">1%</option>
                  <option value="3">3%</option>
                  <option value="5">5%</option>
                </select>
              </span>
            </label>
          )}
          {tab === "matrix" && (
            <label className="field">
              Jogos mín.
              <span className="select-wrap">
                <select
                  value={minGames}
                  onChange={(e) => setMinGames(e.target.value)}
                >
                  <option value="0">0</option>
                  <option value="1">1</option>
                  <option value="3">3</option>
                  <option value="5">5</option>
                </select>
              </span>
            </label>
          )}
          {(tab === "standings" || tab === "lists") && (
            <label className="field">
              Arquétipo
              <input
                className="search"
                value={archFilter}
                onChange={(e) => setArchFilter(e.target.value)}
                placeholder="Filtrar arquétipo…"
              />
            </label>
          )}
          {(tab === "meta" || tab === "standings" || tab === "lists") && (
            <div className="filter-toggles" role="group" aria-label="Atalhos">
              <button
                type="button"
                className="chip-toggle"
                aria-pressed={onlyDay2}
                onClick={() => setOnlyDay2((v) => !v)}
              >
                Day2
              </button>
              <button
                type="button"
                className="chip-toggle"
                aria-pressed={onlyTop8}
                onClick={() => setOnlyTop8((v) => !v)}
              >
                Top8
              </button>
            </div>
          )}
          <button type="button" className="filter-clear" onClick={resetFilters}>
            Limpar
          </button>
        </div>
      )}

      {tab === "meta" && (
        <section id="metagame" className="panel">
          <h2>Metagame</h2>
          <p className="sub">
            Day2 = presente nas rodadas 8–13 ({t.day2Cut} jogadores). Clique nas
            setas para ordenar.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortTh
                    label="Arquétipo"
                    col="nome"
                    sort={sortMeta}
                    onSort={(c) => setSortMeta((s) => toggleSort(s, c))}
                  />
                  <SortTh
                    label="#"
                    col="copias"
                    sort={sortMeta}
                    onSort={(c) => setSortMeta((s) => toggleSort(s, c))}
                    className="num"
                  />
                  <SortTh
                    label="Meta"
                    col="metaPct"
                    sort={sortMeta}
                    onSort={(c) => setSortMeta((s) => toggleSort(s, c))}
                    className="num"
                  />
                  <th>Share</th>
                  <SortTh
                    label="WR"
                    col="winrate"
                    sort={sortMeta}
                    onSort={(c) => setSortMeta((s) => toggleSort(s, c))}
                    className="num"
                  />
                  <SortTh
                    label="Day2"
                    col="day2"
                    sort={sortMeta}
                    onSort={(c) => setSortMeta((s) => toggleSort(s, c))}
                    className="num"
                  />
                  <SortTh
                    label="Top8"
                    col="top8"
                    sort={sortMeta}
                    onSort={(c) => setSortMeta((s) => toggleSort(s, c))}
                    className="num"
                  />
                  <SortTh
                    label="Champ"
                    col="champions"
                    sort={sortMeta}
                    onSort={(c) => setSortMeta((s) => toggleSort(s, c))}
                    className="num"
                  />
                </tr>
              </thead>
              <tbody>
                {filteredArch.map((a) => (
                  <tr key={a.slug}>
                    <td>
                      <strong>{a.nome}</strong>
                    </td>
                    <td className="num">{a.copias}</td>
                    <td className="num">{pct(a.metaPct, 2)}</td>
                    <td>
                      <Bar value={a.copias} max={maxCopies} />
                    </td>
                    <td className="num">{pct(a.winrate, 2)}</td>
                    <td className="num">
                      {a.day2}{" "}
                      <span className="muted">({pct(a.day2Conv, 2)})</span>
                    </td>
                    <td className="num">
                      {a.top8}{" "}
                      <span className="muted">({pct(a.top8Conv, 2)})</span>
                    </td>
                    <td className="num">{a.champions || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filteredArch.length ? (
            <p className="muted">Nenhum arquétipo com esses filtros.</p>
          ) : null}
        </section>
      )}

      {tab === "matrix" && (
        <section className="panel">
          <h2>Matriz de confrontos</h2>
          <p className="sub">
            Linha contra coluna. Winrate = vitórias / jogos (melhor de 3; inclui
            empates de jogo).
          </p>
          <div className="filters inline">
            <span className="legend rate-down">Abaixo 45%</span>
            <span className="legend rate-mid">45% – 55%</span>
            <span className="legend rate-up">Acima 55%</span>
            <label className="field">
              Ordenar eixos
              <span className="select-wrap">
                <select
                  value={`${sortMatrix.key}:${sortMatrix.dir}`}
                  onChange={(e) => {
                    const [key, dir] = e.target.value.split(":");
                    setSortMatrix({ key, dir });
                  }}
                >
                  <option value="copias:desc">Meta ↓</option>
                  <option value="copias:asc">Meta ↑</option>
                  <option value="jogos:desc">Jogos ↓</option>
                  <option value="jogos:asc">Jogos ↑</option>
                  <option value="winrate:desc">WR ↓</option>
                  <option value="winrate:asc">WR ↑</option>
                  <option value="nome:asc">Nome A–Z</option>
                  <option value="nome:desc">Nome Z–A</option>
                </select>
              </span>
            </label>
          </div>
          {!matrixArch.length ? (
            <p className="muted">Nenhum arquétipo com esses filtros.</p>
          ) : (
            <div
              className="matrix-wrap"
              role="region"
              aria-label="Matriz de confrontos"
              tabIndex={0}
            >
              <table className="matrix">
                <thead>
                  <tr>
                    <th className="sticky-col">Arquétipo</th>
                    <th>Geral</th>
                    {matrixArch.map((a) => (
                      <th key={a.slug} title={a.nome}>
                        {a.nome}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixArch.map((row) => {
                    const rowWr =
                      row.gameWinrate != null ? row.gameWinrate : row.winrate;
                    const rowJogos =
                      row.games != null
                        ? row.games
                        : (row.matchups || []).reduce(
                            (s, m) => s + matchupJogos(m),
                            0
                          );
                    return (
                    <tr key={row.slug}>
                      <th className="sticky-col" scope="row">
                        {row.nome}
                      </th>
                      <td className={`matrix-cell ${rateClass(rowWr)}`}>
                        <strong>{pct(rowWr, 2)}</strong>
                        <span className="muted">{rowJogos || 0}j</span>
                      </td>
                      {matrixArch.map((col) => {
                        if (row.nome === col.nome) {
                          return (
                            <td key={col.slug} className="matrix-cell diagonal">
                              —
                            </td>
                          );
                        }
                        const stats = matchupLookup
                          .get(row.nome)
                          ?.get(col.nome);
                        const jogos = matchupJogos(stats);
                        if (!stats || !(jogos > 0)) {
                          return (
                            <td key={col.slug} className="matrix-cell empty">
                              —
                            </td>
                          );
                        }
                        if (jogos < minJogos) {
                          return (
                            <td key={col.slug} className="matrix-cell empty">
                              —
                            </td>
                          );
                        }
                        return (
                          <td
                            key={col.slug}
                            className={`matrix-cell ${rateClass(stats.winrate)}`}
                            title={`${stats.vitorias}V · ${stats.derrotas}D · ${stats.empates || 0}E (jogos)`}
                          >
                            <strong>{pct(stats.winrate, 2)}</strong>
                            <span className="muted">{jogos}j</span>
                          </td>
                        );
                      })}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "top8" && (
        <section className="grid-2">
          <div className="panel">
            <h2>Top 8 Swiss</h2>
            <p className="sub">Corte após 13 rodadas</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Jogador</th>
                    <th>Arquétipo</th>
                    <th>Record</th>
                  </tr>
                </thead>
                <tbody>
                  {(bracket.top8 || []).map((p) => (
                    <tr key={p.username}>
                      <td>{p.rank}</td>
                      <td>
                        <strong>{p.name}</strong>
                        {p.username === t.champion ? (
                          <>
                            {" "}
                            <span className="badge">Campeão</span>
                          </>
                        ) : null}
                      </td>
                      <td>{p.archetype}</td>
                      <td>{p.record}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <h2>Bracket</h2>
            <p className="sub">Eliminatórias</p>
            <div className="bracket">
              {(bracket.quarterfinals || []).map((m, i) => (
                <div className="match" key={`qf-${i}`}>
                  <div className="round">Quartas</div>
                  <div className={`row ${m.winner === m.p1 ? "winner" : ""}`}>
                    <span>
                      {m.p1}{" "}
                      <span className="muted">· {m.p1Archetype}</span>
                    </span>
                    <span>{m.p1gw ?? ""}</span>
                  </div>
                  <div className={`row ${m.winner === m.p2 ? "winner" : ""}`}>
                    <span>
                      {m.p2}{" "}
                      <span className="muted">· {m.p2Archetype}</span>
                    </span>
                    <span>{m.p2gw ?? ""}</span>
                  </div>
                </div>
              ))}
              {(bracket.semifinals || []).map((m, i) => (
                <div className="match" key={`sf-${i}`}>
                  <div className="round">Semifinal</div>
                  <div className={`row ${m.winner === m.p1 ? "winner" : ""}`}>
                    <span>
                      {m.p1}{" "}
                      <span className="muted">· {m.p1Archetype}</span>
                    </span>
                    <span>{m.p1gw ?? ""}</span>
                  </div>
                  <div className={`row ${m.winner === m.p2 ? "winner" : ""}`}>
                    <span>
                      {m.p2}{" "}
                      <span className="muted">· {m.p2Archetype}</span>
                    </span>
                    <span>{m.p2gw ?? ""}</span>
                  </div>
                </div>
              ))}
              {bracket.finals ? (
                <div className="match">
                  <div className="round">Final</div>
                  <div
                    className={`row ${
                      bracket.finals.winner === bracket.finals.p1
                        ? "winner"
                        : ""
                    }`}
                  >
                    <span>
                      {bracket.finals.p1}{" "}
                      <span className="muted">
                        · {bracket.finals.p1Archetype}
                      </span>
                    </span>
                  </div>
                  <div
                    className={`row ${
                      bracket.finals.winner === bracket.finals.p2
                        ? "winner"
                        : ""
                    }`}
                  >
                    <span>
                      {bracket.finals.p2}{" "}
                      <span className="muted">
                        · {bracket.finals.p2Archetype}
                      </span>
                    </span>
                  </div>
                  <p className="muted">
                    {bracket.finals.winner} venceu {bracket.finals.score}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      )}

      {tab === "standings" && (
        <section className="panel">
          <h2>Standings</h2>
          <p className="sub">
            Swiss Round 13 · mesmas colunas e desempates do Melee
            {sortedStandings.length ? ` · ${sortedStandings.length} jogadores` : ""}
            {" · "}passe o mouse no nome para ver os pareamentos
          </p>
          <div className="table-wrap">
            <table className="standings-table">
              <thead>
                <tr>
                  <SortTh
                    label="Rank"
                    col="rank"
                    sort={sortStandings}
                    onSort={(c) => setSortStandings((s) => toggleSort(s, c))}
                  />
                  <SortTh
                    label="Players/Teams"
                    col="name"
                    sort={sortStandings}
                    onSort={(c) => setSortStandings((s) => toggleSort(s, c))}
                  />
                  <SortTh
                    label="Decklist"
                    col="decklist"
                    sort={sortStandings}
                    onSort={(c) => setSortStandings((s) => toggleSort(s, c))}
                  />
                  <SortTh
                    label="Match Record"
                    col="matchRecord"
                    sort={sortStandings}
                    onSort={(c) => setSortStandings((s) => toggleSort(s, c))}
                  />
                  <SortTh
                    label="Game Record"
                    col="gameRecord"
                    sort={sortStandings}
                    onSort={(c) => setSortStandings((s) => toggleSort(s, c))}
                  />
                  <SortTh
                    label="Points"
                    col="points"
                    sort={sortStandings}
                    onSort={(c) => setSortStandings((s) => toggleSort(s, c))}
                    className="num"
                  />
                  <SortTh
                    label="OMW%"
                    col="omw"
                    sort={sortStandings}
                    onSort={(c) => setSortStandings((s) => toggleSort(s, c))}
                    className="num"
                  />
                  <SortTh
                    label="TGW%"
                    col="tgw"
                    sort={sortStandings}
                    onSort={(c) => setSortStandings((s) => toggleSort(s, c))}
                    className="num"
                  />
                  <SortTh
                    label="OGW%"
                    col="ogw"
                    sort={sortStandings}
                    onSort={(c) => setSortStandings((s) => toggleSort(s, c))}
                    className="num"
                  />
                </tr>
              </thead>
              <tbody>
                {sortedStandings.map((r) => (
                  <tr
                    key={`${r.rank}-${r.username || r.name}`}
                    className={r.decklistId ? "clickable" : undefined}
                    onClick={() => openDeck(r.decklistId)}
                  >
                    <td>{r.rank}</td>
                    <td>
                      <PairingsHover
                        name={r.name}
                        pairings={
                          data.pairingsByUser?.[
                            String(r.username || "").toLowerCase()
                          ] || []
                        }
                      >
                        <strong className="player-name-hover">{r.name}</strong>
                      </PairingsHover>
                    </td>
                    <td>
                      <span>{r.deckDisplay || "—"}</span>
                      {r.decklistName &&
                      r.nomeConsolidado &&
                      r.decklistName !== r.nomeConsolidado ? (
                        <span className="deck-consol muted">
                          Melee: {r.decklistName}
                        </span>
                      ) : null}
                    </td>
                    <td>{r.matchRecord}</td>
                    <td>{r.gameRecord}</td>
                    <td className="num">{r.points}</td>
                    <td className="num mono">{pctMelee(r.omw, 2)}</td>
                    <td className="num mono">{pctMelee(r.tgw, 2)}</td>
                    <td className="num mono">{pctMelee(r.ogw, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "lists" && (
        <section className="panel">
          <h2>Listas</h2>
          <p className="sub">Clique para abrir main/side</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortTh
                    label="#"
                    col="rank"
                    sort={sortLists}
                    onSort={(c) => setSortLists((s) => toggleSort(s, c))}
                  />
                  <SortTh
                    label="Jogador"
                    col="name"
                    sort={sortLists}
                    onSort={(c) => setSortLists((s) => toggleSort(s, c))}
                  />
                  <SortTh
                    label="Arquétipo"
                    col="archetype"
                    sort={sortLists}
                    onSort={(c) => setSortLists((s) => toggleSort(s, c))}
                  />
                  <SortTh
                    label="Melee"
                    col="melee"
                    sort={sortLists}
                    onSort={(c) => setSortLists((s) => toggleSort(s, c))}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedLists.map((p) => (
                  <tr
                    key={p.decklistId}
                    className="clickable"
                    onClick={() => openDeck(p.decklistId)}
                  >
                    <td>{p.standing?.rank || "—"}</td>
                    <td>
                      <strong>{p.displayName || p.playerName}</strong>
                    </td>
                    <td>{p.nomeConsolidado}</td>
                    <td className="muted">{p.meleeDeckName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer className="footer">
        Fuguete Pauper · Super Pauper 50K. Dados de{" "}
        <a href={t.source} target="_blank" rel="noreferrer">
          Melee #447619
        </a>
        . Day2 = 64 jogadores nas rodadas 8–13.
      </footer>

      <DeckModal deck={selectedDeck} onClose={() => setSelectedDeck(null)} />
    </div>
  );
}
