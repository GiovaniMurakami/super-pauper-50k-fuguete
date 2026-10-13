const CACHE = new Map();
const BATCH = 75;
const GAP_MS = 80;

let queue = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function imageFromCard(card) {
  if (!card) return null;
  return (
    card.image_uris?.normal ||
    card.image_uris?.large ||
    card.card_faces?.[0]?.image_uris?.normal ||
    card.card_faces?.[0]?.image_uris?.large ||
    null
  );
}

function cardMatchesName(card, name) {
  const key = normalizeKey(name);
  const candidates = [
    card.name,
    ...(card.card_faces || []).map((f) => f.name),
  ].filter(Boolean);
  return candidates.some((n) => {
    const nk = normalizeKey(n);
    return nk === key || nk.startsWith(key) || key.startsWith(nk.split(" // ")[0]);
  });
}

function collectionName(name) {
  // Scryfall collection resolve melhor a face da frente em DFCs.
  return String(name || "").split(" // ")[0].trim();
}

async function fetchCollection(names) {
  const res = await fetch("https://api.scryfall.com/cards/collection", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      // Scryfall rejeita UA padrão de libs HTTP (ex.: Node fetch).
      "User-Agent": "SuperPauper50K/1.0 (metagame viewer)",
    },
    body: JSON.stringify({
      identifiers: names.map((name) => ({ name: collectionName(name) })),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Scryfall ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  const data = await res.json();
  return Array.isArray(data?.data) ? data.data : [];
}

function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.then(
    () => sleep(GAP_MS),
    () => sleep(GAP_MS)
  );
  return run;
}

/** @returns {Promise<Map<string, { name: string, image: string|null }>>} */
export async function fetchCardsByName(names) {
  const unique = [
    ...new Set(
      (names || []).map((n) => String(n || "").trim()).filter(Boolean)
    ),
  ];
  const result = new Map();
  const missing = [];

  for (const name of unique) {
    const cached = CACHE.get(normalizeKey(name));
    if (cached) result.set(name, cached);
    else missing.push(name);
  }

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const cards = await enqueue(() => fetchCollection(batch));
    for (const card of cards) {
      const entry = {
        name: card.name,
        image: imageFromCard(card),
        typeLine: card.type_line || card.card_faces?.[0]?.type_line || "",
        cmc: Number(card.cmc) || 0,
      };
      CACHE.set(normalizeKey(card.name), entry);
      for (const face of card.card_faces || []) {
        if (face?.name) CACHE.set(normalizeKey(face.name), entry);
      }
      for (const requested of batch) {
        if (cardMatchesName(card, requested)) {
          CACHE.set(normalizeKey(requested), entry);
          result.set(requested, entry);
        }
      }
    }
    for (const requested of batch) {
      if (!result.has(requested)) {
        const fallback = {
          name: requested,
          image: null,
          typeLine: "",
          cmc: 0,
        };
        CACHE.set(normalizeKey(requested), fallback);
        result.set(requested, fallback);
      }
    }
  }

  return result;
}
