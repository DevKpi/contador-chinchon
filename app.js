// Registro de Service Worker para PWA offline
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => {
    console.log('Service Worker registration skipped:', err);
  });
}

// Estado global de la aplicación
const state = {
  players: [], // [{ id, name, score, eliminated }]
  rounds: [],  // [{ roundNum, entries: { [playerId]: { added, totalAfter, reengaged, eliminated } } }]
  limitScore: 100,
  isGameOver: false,
  pendingReenganchados: [] // Cola de jugadores que deben decidir reenganche
};

// Elementos del DOM
const setupSection = document.getElementById('setup-section');
const gameSection = document.getElementById('game-section');
const playerNamesInput = document.getElementById('player-names');
const startBtn = document.getElementById('start-btn');
const newGameBtn = document.getElementById('new-game-btn');
const undoBtn = document.getElementById('undo-btn');
const tableHead = document.getElementById('table-head');
const tableBody = document.getElementById('table-body');
const tableWrapper = document.getElementById('table-wrapper');
const roundTitle = document.getElementById('round-title');
const roundInputs = document.getElementById('round-inputs');
const submitRoundBtn = document.getElementById('submit-round-btn');
const currentRoundBadge = document.getElementById('current-round-badge');
const limitScoreBadge = document.getElementById('limit-score-badge');

// Modales
const gameOverModal = document.getElementById('game-over-modal');
const winnerTitle = document.getElementById('winner-title');
const winnerDesc = document.getElementById('winner-desc');
const podiumList = document.getElementById('podium-list');
const closeModalBtn = document.getElementById('close-modal-btn');
const restartGameBtn = document.getElementById('restart-game-btn');

const reengancheModal = document.getElementById('reenganche-modal');
const reengancheText = document.getElementById('reenganche-text');
const reengancheAcceptBtn = document.getElementById('reenganche-accept-btn');
const reengancheDeclineBtn = document.getElementById('reenganche-decline-btn');

// Selección de límite de puntos
document.querySelectorAll('.segment-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    state.limitScore = parseInt(e.target.dataset.score, 10);
  });
});

// Presets de nombres rápidos
document.getElementById('preset-2')?.addEventListener('click', () => {
  playerNamesInput.value = 'Jugador 1, Jugador 2';
});

document.getElementById('preset-4')?.addEventListener('click', () => {
  playerNamesInput.value = 'Thiago, Carlos, Sofía, Lucas';
});

// Iniciar Partida
startBtn.addEventListener('click', () => {
  const rawNames = playerNamesInput.value.trim();
  const names = rawNames
    .split(',')
    .map(n => n.trim())
    .filter(n => n.length > 0);

  if (names.length < 2 || names.length > 8) {
    alert('Por favor ingresa entre 2 y 8 jugadores separados por coma.');
    return;
  }

  // Inicializar estado
  state.players = names.map((name, id) => ({
    id,
    name,
    score: 0,
    eliminated: false
  }));
  state.rounds = [];
  state.isGameOver = false;

  limitScoreBadge.textContent = `${state.limitScore} pts`;
  setupSection.style.display = 'none';
  gameSection.style.display = 'block';
  newGameBtn.style.display = 'inline-flex';

  renderBoard();
  prepareRound();
});

// Botón Nueva Partida
newGameBtn.addEventListener('click', () => {
  if (state.rounds.length > 0 && !state.isGameOver) {
    if (!confirm('¿Seguro que deseas abandonar la partida en curso e iniciar una nueva?')) {
      return;
    }
  }
  resetToSetup();
});

function resetToSetup() {
  gameSection.style.display = 'none';
  setupSection.style.display = 'block';
  newGameBtn.style.display = 'none';
  gameOverModal.style.display = 'none';
  reengancheModal.style.display = 'none';
}

// Renderizar la Planilla (Columnas por Jugador)
function renderBoard() {
  // 1. Cabecera con Columnas
  let headHtml = `<tr><th class="round-header">Mano</th>`;

  state.players.forEach(p => {
    let badgeClass = 'player-total-badge';
    if (p.eliminated) {
      badgeClass += ' eliminated';
    } else if (p.score >= state.limitScore * 0.85) {
      badgeClass += ' danger';
    } else if (p.score >= state.limitScore * 0.6) {
      badgeClass += ' warning';
    }

    headHtml += `
      <th>
        <div class="player-header-content">
          <span class="player-name-text" title="${p.name}">${p.name}</span>
          <span class="${badgeClass}">${p.score} pts</span>
        </div>
      </th>
    `;
  });
  headHtml += `</tr>`;
  tableHead.innerHTML = headHtml;

  // 2. Filas del Cuerpo (Historial de Manos)
  if (state.rounds.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td class="round-cell">Inicio</td>
        ${state.players.map(() => `<td><div class="cell-score-box"><span class="cell-cum-score">0</span></div></td>`).join('')}
      </tr>
    `;
    return;
  }

  let bodyHtml = `
    <tr>
      <td class="round-cell">Inicio</td>
      ${state.players.map(() => `<td><div class="cell-score-box"><span class="cell-cum-score">0</span></div></td>`).join('')}
    </tr>
  `;

  state.rounds.forEach(round => {
    bodyHtml += `<tr>`;
    bodyHtml += `<td class="round-cell">#${round.roundNum}</td>`;

    state.players.forEach(p => {
      const entry = round.entries[p.id];
      if (!entry) {
        bodyHtml += `<td><span class="out-badge">❌ Fuera</span></td>`;
      } else if (entry.eliminated) {
        bodyHtml += `
          <td>
            <div class="cell-score-box">
              <span class="cell-cum-score">${entry.totalAfter}</span>
              <span class="out-badge">❌ Eliminado</span>
            </div>
          </td>
        `;
      } else if (entry.reengaged) {
        bodyHtml += `
          <td>
            <div class="cell-score-box">
              <span class="cell-cum-score">${entry.totalAfter}</span>
              <span class="reengage-badge">🔄 Reenganche (${entry.totalAfter})</span>
            </div>
          </td>
        `;
      } else {
        const deltaClass = entry.added < 0 ? 'negative' : (entry.added === 0 ? 'zero' : 'positive');
        const deltaSign = entry.added > 0 ? `+${entry.added}` : `${entry.added}`;
        bodyHtml += `
          <td>
            <div class="cell-score-box">
              <span class="cell-cum-score">${entry.totalAfter}</span>
              <span class="cell-delta ${deltaClass}">${deltaSign}</span>
            </div>
          </td>
        `;
      }
    });

    bodyHtml += `</tr>`;
  });

  tableBody.innerHTML = bodyHtml;

  // Auto-scroll hacia la última fila de la planilla
  setTimeout(() => {
    tableWrapper.scrollTop = tableWrapper.scrollHeight;
  }, 50);
}

// Preparar inputs de la siguiente mano
function prepareRound() {
  const nextRoundNum = state.rounds.length + 1;
  currentRoundBadge.textContent = `Mano #${nextRoundNum}`;
  roundTitle.textContent = `Anotar Mano #${nextRoundNum}`;
  undoBtn.disabled = state.rounds.length === 0 || state.isGameOver;

  if (state.isGameOver) {
    roundInputs.innerHTML = `<p class="empty-table-msg">Partida finalizada. Consulta la planilla de puntuaciones arriba.</p>`;
    submitRoundBtn.disabled = true;
    return;
  }

  submitRoundBtn.disabled = false;
  roundInputs.innerHTML = '';

  const activePlayers = state.players.filter(p => !p.eliminated);

  activePlayers.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className = 'player-input-card';
    card.innerHTML = `
      <div class="player-input-header">
        <strong>${p.name}</strong>
        <span class="current-preview">Lleva: ${p.score} pts</span>
      </div>
      <div class="input-with-actions">
        <input type="number" 
               id="score-input-${p.id}" 
               class="score-input-number" 
               value="0" 
               step="1"
               inputmode="numeric">
        <div class="quick-points-row">
          <button type="button" class="btn-quick-pt corte" data-id="${p.id}" data-action="set" data-val="-10">-10</button>
          <button type="button" class="btn-quick-pt corte" data-id="${p.id}" data-action="set" data-val="0">0</button>
          <button type="button" class="btn-quick-pt" data-id="${p.id}" data-action="add" data-val="10">+10</button>
          <button type="button" class="btn-quick-pt" data-id="${p.id}" data-action="add" data-val="20">+20</button>
          <button type="button" class="btn-quick-pt" data-id="${p.id}" data-action="add" data-val="30">+30</button>
        </div>
      </div>
    `;
    roundInputs.appendChild(card);
  });

  // Event listeners para botones rápidos
  document.querySelectorAll('.btn-quick-pt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pid = e.currentTarget.dataset.id;
      const action = e.currentTarget.dataset.action;
      const val = parseInt(e.currentTarget.dataset.val, 10);
      const input = document.getElementById(`score-input-${pid}`);
      if (!input) return;

      if (action === 'set') {
        input.value = val;
      } else if (action === 'add') {
        const current = parseInt(input.value, 10) || 0;
        input.value = current + val;
      }
    });
  });

  // Focus en el primer input
  const firstInput = document.querySelector('.score-input-number');
  if (firstInput) {
    firstInput.select();
  }
}

// Calcular puntaje máximo de reenganche (el más alto entre los activos menores al límite)
function getHighestActiveScore() {
  const activeUnderLimit = state.players
    .filter(p => !p.eliminated && p.score < state.limitScore)
    .map(p => p.score);

  if (activeUnderLimit.length > 0) {
    return Math.max(...activeUnderLimit);
  }
  return state.limitScore - 1;
}

// Guardar Mano
submitRoundBtn.addEventListener('click', () => {
  if (state.isGameOver) return;

  const activePlayers = state.players.filter(p => !p.eliminated);
  const roundEntries = {};
  const playersOverLimit = [];

  // 1. Recolectar puntos
  activePlayers.forEach(p => {
    const input = document.getElementById(`score-input-${p.id}`);
    const added = input ? (parseInt(input.value, 10) || 0) : 0;
    const newScore = p.score + added;

    roundEntries[p.id] = {
      added,
      totalAfter: newScore,
      reengaged: false,
      eliminated: false
    };

    p.score = newScore;

    if (p.score >= state.limitScore) {
      playersOverLimit.push(p);
    }
  });

  // 2. Procesar reenganches o eliminaciones
  if (playersOverLimit.length > 0) {
    handleReenganchados(playersOverLimit, roundEntries, () => {
      finalizeRound(roundEntries);
    });
  } else {
    finalizeRound(roundEntries);
  }
});

// Manejo interactivo de reenganche (secuencial si son varios)
function handleReenganchados(playerList, roundEntries, onComplete) {
  if (playerList.length === 0) {
    onComplete();
    return;
  }

  const currentPlayer = playerList[0];
  const remainingList = playerList.slice(1);
  const highestScore = getHighestActiveScore();

  reengancheText.innerHTML = `
    <strong>${currentPlayer.name}</strong> sumó un total de <strong>${currentPlayer.score} puntos</strong> (Límite: ${state.limitScore} pts).<br><br>
    ¿Desea reengancharse con el puntaje más alto activo (<strong>${highestScore} pts</strong>)?
  `;
  reengancheModal.style.display = 'flex';

  // Clonar botones para limpiar listeners previos
  const newAcceptBtn = reengancheAcceptBtn.cloneNode(true);
  const newDeclineBtn = reengancheDeclineBtn.cloneNode(true);
  reengancheAcceptBtn.parentNode.replaceChild(newAcceptBtn, reengancheAcceptBtn);
  reengancheDeclineBtn.parentNode.replaceChild(newDeclineBtn, reengancheDeclineBtn);

  newAcceptBtn.addEventListener('click', () => {
    reengancheModal.style.display = 'none';
    currentPlayer.score = highestScore;
    roundEntries[currentPlayer.id].reengaged = true;
    roundEntries[currentPlayer.id].totalAfter = highestScore;
    handleReenganchados(remainingList, roundEntries, onComplete);
  });

  newDeclineBtn.addEventListener('click', () => {
    reengancheModal.style.display = 'none';
    currentPlayer.eliminated = true;
    roundEntries[currentPlayer.id].eliminated = true;
    handleReenganchados(remainingList, roundEntries, onComplete);
  });
}

// Finalizar guardado de la mano
function finalizeRound(roundEntries) {
  const roundNum = state.rounds.length + 1;
  state.rounds.push({
    roundNum,
    entries: roundEntries
  });

  // Verificar ganador o fin de juego
  const remainingActive = state.players.filter(p => !p.eliminated);

  renderBoard();

  if (remainingActive.length <= 1) {
    state.isGameOver = true;
    showGameOver(remainingActive.length === 1 ? remainingActive[0] : null);
  }

  prepareRound();
}

// Deshacer última mano
undoBtn.addEventListener('click', () => {
  if (state.rounds.length === 0) return;

  if (confirm('¿Deseas deshacer la última mano registrada?')) {
    state.rounds.pop();
    state.isGameOver = false;

    // Recalcular el estado de todos los jugadores desde cero
    state.players.forEach(p => {
      p.score = 0;
      p.eliminated = false;
    });

    state.rounds.forEach(round => {
      state.players.forEach(p => {
        const entry = round.entries[p.id];
        if (entry) {
          p.score = entry.totalAfter;
          if (entry.eliminated) {
            p.eliminated = true;
          }
        }
      });
    });

    renderBoard();
    prepareRound();
  }
});

// Mostrar modal de fin de partida
function showGameOver(winner) {
  if (winner) {
    winnerTitle.textContent = '🏆 ¡Tenemos Ganador!';
    winnerDesc.innerHTML = `¡Felicitaciones <strong>${winner.name}</strong> por ganar la partida de Chinchón!`;
  } else {
    winnerTitle.textContent = 'Partida Finalizada';
    winnerDesc.textContent = 'Todos los jugadores han alcanzado o superado el límite de puntos.';
  }

  // Ordenar posiciones por puntaje
  const sorted = [...state.players].sort((a, b) => {
    if (a.eliminated && !b.eliminated) return 1;
    if (!a.eliminated && b.eliminated) return -1;
    return a.score - b.score;
  });

  let podiumHtml = '';
  sorted.forEach((p, idx) => {
    const isWinner = winner && p.id === winner.id;
    podiumHtml += `
      <div class="podium-item ${isWinner ? 'winner' : ''}">
        <span>${idx + 1}° ${p.name} ${isWinner ? '👑' : ''} ${p.eliminated ? '(Eliminado)' : ''}</span>
        <strong>${p.score} pts</strong>
      </div>
    `;
  });
  podiumList.innerHTML = podiumHtml;

  gameOverModal.style.display = 'flex';
}

closeModalBtn.addEventListener('click', () => {
  gameOverModal.style.display = 'none';
});

restartGameBtn.addEventListener('click', () => {
  resetToSetup();
});