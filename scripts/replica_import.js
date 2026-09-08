// scripts/replica_import.js

// devalue format parser (SvelteKit __data.json)
function parseDevalue(dataArray) {
  const cache = new Map();
  function hydrate(index) {
    if (typeof index !== 'number') return index;
    if (cache.has(index)) return cache.get(index);
    const val = dataArray[index];
    if (val === null || typeof val !== 'object') {
      cache.set(index, val);
      return val;
    }
    if (Array.isArray(val)) {
      const arr = [];
      cache.set(index, arr);
      for (let i = 0; i < val.length; i++) {
        arr.push(hydrate(val[i]));
      }
      return arr;
    }
    const obj = {};
    cache.set(index, obj);
    for (const k in val) {
      obj[k] = hydrate(val[k]);
    }
    return obj;
  }
  return hydrate(0);
}

// PokeAPI Caching
const pokeapiCache = {};

async function fetchPokeApiJaName(endpoint) {
  if (pokeapiCache[endpoint]) return pokeapiCache[endpoint];
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/${endpoint}`);
    if (!res.ok) return '';
    const data = await res.json();
    const jaNameObj = data.names?.find(n => n.language.name === 'ja-Hrkt' || n.language.name === 'ja');
    const name = jaNameObj ? jaNameObj.name : (data.name || '');
    pokeapiCache[endpoint] = name;
    return name;
  } catch (e) {
    console.warn("PokeAPI error:", e);
    return '';
  }
}

// EV Mapping from SvelteKit keys to PE keys
const evMap = { hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe' };

window.openReplicaModal = function() {
  document.getElementById('replica-modal').style.display = 'flex';
  document.getElementById('replica-code-input').value = '';
  document.getElementById('replica-error').innerText = '';
  document.getElementById('replica-loading').style.display = 'none';
};

window.closeReplicaModal = function() {
  document.getElementById('replica-modal').style.display = 'none';
};

window.importReplicaCode = async function() {
  const code = document.getElementById('replica-code-input').value.trim();
  if (!code) return;

  const errorEl = document.getElementById('replica-error');
  const loadingEl = document.getElementById('replica-loading');
  errorEl.innerText = '';
  loadingEl.style.display = 'block';

  try {
    // 1. Fetch JSON
    const res = await fetch(`https://champions.karthikb.dev/replica/${code}/__data.json`);
    if (!res.ok) {
      throw new Error("レンタルコードが見つからないか、通信エラーです。");
    }
    const json = await res.json();

    // 2. Parse devalue array (nodes[x].data where type is 'data')
    // SvelteKit returns { type: 'data', nodes: [...] }
    let dataArray = null;
    if (json.nodes) {
      for (const node of json.nodes) {
        if (node && node.type === 'data' && Array.isArray(node.data)) {
          // Typically node 0 is layout, node 3 or something is page. We need the one with 'team'
          // We'll just check all
          const candidate = parseDevalue(node.data);
          if (candidate && Array.isArray(candidate.team)) {
             dataArray = node.data; // found it
             break;
          }
        }
      }
    } else {
      dataArray = json;
    }

    if (!dataArray) throw new Error("データの解析に失敗しました(フォーマット変更の可能性)");

    const parsed = parseDevalue(dataArray);

    let team = parsed.team;
    if (!team || team.length === 0) {
       throw new Error("パーティデータが見つかりませんでした。");
    }

    // 3. 変換
    const peParty = [];
    await Promise.all(team.map(async (poke) => {
      if (!poke) return;
      const pePoke = {
        name: '',
        item: '',
        ability: '',
        moves: ['', '', '', ''],
        nature: '',
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        memo: ''
      };

      const tasks = [];

      // 種族
      if (poke.species) {
        if (window.pokemonData) {
          const matched = window.pokemonData.find(p => p.no === String(poke.species));
          if (matched) pePoke.name = matched.name;
        }
        if (!pePoke.name) {
          tasks.push(fetchPokeApiJaName(`pokemon-species/${poke.species}`).then(n => pePoke.name = n));
        }
      }

      // 持ち物
      if (poke.item) {
        tasks.push(fetchPokeApiJaName(`item/${poke.item}`).then(n => pePoke.item = n));
      }

      // 特性
      if (poke.ability) {
        tasks.push(fetchPokeApiJaName(`ability/${poke.ability}`).then(n => pePoke.ability = n));
      }

      // 技
      if (poke.moves && Array.isArray(poke.moves)) {
        poke.moves.forEach((moveId, index) => {
          if (moveId && index < 4) {
            tasks.push(fetchPokeApiJaName(`move/${moveId}`).then(n => pePoke.moves[index] = n));
          }
        });
      }

      // 性格
      if (poke.nature) {
        tasks.push(fetchPokeApiJaName(`nature/${poke.nature}`).then(n => pePoke.nature = n));
      }

      // 努力値
      if (poke.evs) {
         Object.keys(poke.evs).forEach(k => {
           if (evMap[k]) pePoke.evs[evMap[k]] = poke.evs[k] || 0;
         });
      }

      await Promise.all(tasks);
      peParty.push(pePoke);
    }));

    // 4. アプリへ適用
    closeReplicaModal();
    if (typeof window.applyAnalyzedPartyToPE === 'function') {
      window.applyAnalyzedPartyToPE(peParty, null);
    } else {
      alert("エラー: applyAnalyzedPartyToPE 関数が見つかりません。");
    }

  } catch (err) {
    console.error(err);
    errorEl.innerText = err.message || "読み込み中にエラーが発生しました。";
  } finally {
    loadingEl.style.display = 'none';
  }
};
