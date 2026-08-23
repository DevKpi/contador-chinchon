// Registro de Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

// Estado del juego
let players = [];
let roundNumber = 1;

// Elementos del DOM
const setupSection = document.getElementById('setup');
const gameSection = document.getElementById('game');
const playerList = document.getElementById('player-list');
const roundInputs = document.getElementById('round-inputs');
const roundTitle = document.getElementById('round-title');

// Iniciar Partida
document.getElementById('start-btn').addEventListener('click', () => {
  const rawNames = document.getElementById('player-names').value.trim();
  const names = rawNames.split(',').map(n => n.trim()).filter(n => n.length > 0);

  if (names.length < 2 || names.length > 8) {
    alert('Ingresa entre 2 y 8 jugadores separados por coma.');
    return;
  }

  players = names.map((name, id) => ({
    id,
    name,
    score: 0,
    eliminated: false,
    history: []
  }));

  setupSection.style.display = 'none';
  gameSection.style.display = 'block';
  renderBoard();
  prepareRound();
});

// Renderizar tabla y estado
function renderBoard() {
  playerList.innerHTML = '';
  players.forEach(p => {
    const card = document.createElement('div');
    card.className = `player-card ${p.eliminated ? 'eliminated' : ''}`;
    card.innerHTML = `
      <strong>${p.name}</strong>: ${p.score} pts
      ${p.eliminated ? '<span class="tag-out"> (Eliminado)</span>' : ''}
    `;
    playerList.appendChild(card);
  });
}

// Preparar inputs de la siguiente mano
function prepareRound() {
  roundTitle.innerText = `Mano #${roundNumber}`;
  roundInputs.innerHTML = '';

  players.filter(p => !p.eliminated).forEach(p => {
    const row = document.createElement('div');
    row.className = 'input-row';
    row.innerHTML = `
      <label>${p.name}:</label>
      <input type="number" id="score-${p.id}" value="0" step="1">
    `;
    roundInputs.appendChild(row);
  });
}

// Calcular puntaje máximo de reenganche
function getHighestActiveScore() {
  const activeScores = players
    .filter(p => !p.eliminated && p.score < 100)
    .map(p => p.score);
  return activeScores.length > 0 ? Math.max(...activeScores) : 0;
}

// Guardar Mano
document.getElementById('submit-round-btn').addEventListener('click', () => {
  const activePlayers = players.filter(p => !p.eliminated);
  
  // Aplicar puntos ingresados
  activePlayers.forEach(p => {
    const input = document.getElementById(`score-${p.id}`);
    const added = parseInt(input.value, 10) || 0;
    p.score += added;
    p.history.push(added);
  });

  // Evaluar jugadores que alcanzaron o superaron los 100 puntos
  players.forEach(p => {
    if (!p.eliminated && p.score >= 100) {
      const highestScore = getHighestActiveScore();
      const wantRebuy = confirm(
        `${p.name} llegó a ${p.score} puntos.\n¿Desea reengancharse con ${highestScore} puntos?`
      );

      if (wantRebuy) {
        p.score = highestScore;
        p.history.push(`Reenganche (${highestScore})`);
      } else {
        p.eliminated = true;
      }
    }
  });

  // Verificar ganador
  const remaining = players.filter(p => !p.eliminated);
  if (remaining.length <= 1) {
    renderBoard();
    alert(remaining.length === 1 
      ? `¡Juego terminado! Ganador: ${remaining[0].name}` 
      : 'Todos los jugadores han quedado eliminados.');
    document.getElementById('submit-round-btn').disabled = true;
    return;
  }

  roundNumber++;
  renderBoard();
  prepareRound();
});s