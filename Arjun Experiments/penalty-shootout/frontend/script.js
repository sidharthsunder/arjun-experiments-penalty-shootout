// Same host/port as the page (works with any port the Python server binds to)
const API_BASE = `${window.location.origin}/api`;

// Game State
let currentMode = null; // 'solo', 'multiplayer', 'worldcup'
let roomCode = null;
let playerId = null;
let myRole = 'kicker';
let pollInterval = null;
let localState = 'aiming'; // aiming, diving, result

let kicksP1 = 0;
let kicksP2 = 0;
let isSuddenDeath = false;
let gameDifficulty = 'medium';
let pendingWCTeam = null;

const DIFFICULTY_SETTINGS = {
    easy: {
        label: 'Easy',
        gkReadShot: 0,
        gkNoise: 0.35,
        kickerMissChance: 0.28,
        kickerCornerBias: 0.25
    },
    medium: {
        label: 'Medium',
        gkReadShot: 0.35,
        gkNoise: 0.18,
        kickerMissChance: 0.10,
        kickerCornerBias: 0.55
    },
    hard: {
        label: 'Hard',
        gkReadShot: 0.92,
        gkNoise: 0.06,
        kickerMissChance: 0.04,
        kickerCornerBias: 0.88
    }
};

function difficultyLabel() {
    return DIFFICULTY_SETTINGS[gameDifficulty]?.label || 'Medium';
}

function clamp01(v, min = 0.08, max = 0.92) {
    return Math.max(min, Math.min(max, v));
}

function getAiGoalkeeperDive(kickX, kickY) {
    const d = DIFFICULTY_SETTINGS[gameDifficulty];
    if (Math.random() > d.gkReadShot) {
        return {
            x: 0.15 + Math.random() * 0.7,
            y: 0.45 + Math.random() * 0.5
        };
    }
    return {
        x: clamp01(kickX + (Math.random() - 0.5) * d.gkNoise * 2),
        y: clamp01(kickY + (Math.random() - 0.5) * d.gkNoise * 2, 0.25, 0.98)
    };
}

function getAiKickerAim() {
    const d = DIFFICULTY_SETTINGS[gameDifficulty];
    if (Math.random() < d.kickerMissChance) {
        const wide = Math.random() < 0.5;
        return {
            x: wide ? (Math.random() < 0.5 ? 0.01 : 0.99) : 0.2 + Math.random() * 0.6,
            y: wide ? 0.2 + Math.random() * 0.6 : (Math.random() < 0.5 ? 0.02 : 0.99),
            isMiss: true,
            missType: Math.random() < 0.35 ? 'POST!' : 'MISS!'
        };
    }

    const corners = [
        { x: 0.15, y: 0.2 },
        { x: 0.85, y: 0.2 },
        { x: 0.15, y: 0.75 },
        { x: 0.85, y: 0.75 },
        { x: 0.5, y: 0.35 }
    ];
    let target;
    if (Math.random() < d.kickerCornerBias) {
        target = corners[Math.floor(Math.random() * corners.length)];
    } else {
        target = { x: 0.25 + Math.random() * 0.5, y: 0.25 + Math.random() * 0.55 };
    }

    const spread = gameDifficulty === 'hard' ? 0.04 : gameDifficulty === 'medium' ? 0.08 : 0.14;
    return {
        x: clamp01(target.x + (Math.random() - 0.5) * spread),
        y: clamp01(target.y + (Math.random() - 0.5) * spread, 0.12, 0.95),
        isMiss: false,
        missType: 'MISS!'
    };
}

// DOM Elements
const screens = document.querySelectorAll('.screen');
const player1ScoreEl = document.getElementById('player1-score');
const player2ScoreEl = document.getElementById('player2-score');
const gameInfoEl = document.getElementById('game-info');
const roomDisplayEl = document.getElementById('room-display');
const goalAreaEl = document.getElementById('goal-area');
const kickAreaEl = document.getElementById('kick-area');
const ballEl = document.getElementById('ball');
const goalkeeperEl = document.getElementById('goalkeeper');
const resultOverlayEl = document.getElementById('result-overlay');
const resultTextEl = document.getElementById('result-text');
const nextTurnBtnEl = document.getElementById('next-turn-btn');
let lastWinner = null;

// --- Navigation ---
function switchScreen(screenId) {
    screens.forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

function showMainMenu() { switchScreen('menu'); }
function showMultiplayerMenu() { switchScreen('multiplayer-menu'); }
function showWorldCupMenu() { switchScreen('worldcup-menu'); }
function showSoloMenu() { switchScreen('solo-menu'); }

function startSoloWithDifficulty(difficulty) {
    gameDifficulty = difficulty;
    startGame('solo');
}

function startWorldCupWithDifficulty(difficulty) {
    gameDifficulty = difficulty;
    if (pendingWCTeam) {
        tournament.start(pendingWCTeam);
        pendingWCTeam = null;
    }
}

function showWorldCupDifficulty(team) {
    pendingWCTeam = team;
    document.getElementById('wc-difficulty-team').innerText = `Team: ${team}`;
    switchScreen('worldcup-difficulty-menu');
}

// --- Game Initialization ---
function startGame(mode, team = null) {
    currentMode = mode;
    kicksP1 = 0;
    kicksP2 = 0;
    isSuddenDeath = false;
    goalAreaEl.classList.remove('sudden-death');
    player1ScoreEl.innerText = '0';
    player2ScoreEl.innerText = '0';
    
    switchScreen('game-screen');
    
    if (mode === 'solo' || mode === 'worldcup') {
        myRole = 'kicker';
        const diff = difficultyLabel();
        if (mode === 'worldcup') {
            roomDisplayEl.innerText = `World Cup · ${team} · ${diff}`;
        } else {
            roomDisplayEl.innerText = `Solo · ${diff}`;
        }
        resetRound();
        updateGameInfo();
    }
}

// --- Multiplayer API Calls ---
async function createRoom() {
    try {
        const res = await fetch(`${API_BASE}/create_room`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await res.json();
        if (data.error) {
            alert(data.error);
            return;
        }
        roomCode = data.code;
        playerId = data.player;
        myRole = data.role;
        currentMode = 'multiplayer';
        localState = 'aiming';
        
        switchScreen('game-screen');
        roomDisplayEl.innerText = `Room Code: ${roomCode}`;
        gameInfoEl.innerText = 'Waiting for opponent to join...';
        
        startPolling();
    } catch (e) {
        alert("Make sure the backend server is running (same URL as this page).");
    }
}

async function joinRoom() {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!code) return;
    
    try {
        const res = await fetch(`${API_BASE}/join_room`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (data.error) {
            alert(data.error);
            return;
        }
        
        roomCode = data.code;
        playerId = data.player;
        myRole = data.role;
        currentMode = 'multiplayer';
        localState = 'aiming';
        
        switchScreen('game-screen');
        roomDisplayEl.innerText = `Room Code: ${roomCode}`;
        
        startPolling();
        // Fetch state immediately so joiner doesn't wait for first poll tick
        pollRoomState();
    } catch (e) {
        alert("Make sure the backend server is running (same URL as this page).");
    }
}

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(pollRoomState, 500);
}

async function pollRoomState() {
    if (!roomCode || !playerId) return;
    try {
        const res = await fetch(
            `${API_BASE}/room_state?code=${encodeURIComponent(roomCode)}&player=${encodeURIComponent(playerId)}`
        );
        const data = await res.json();
        if (data.error) {
            gameInfoEl.innerHTML = `<span style="color:#ff3366;">Room not found (${roomCode}). Create a new room — the server may have restarted.</span>`;
            return;
        }
        handleServerStateUpdate(data);
    } catch (e) {
        console.error("Polling error", e);
        gameInfoEl.innerHTML = '<span style="color:#ff3366;">Connection lost. Retrying...</span>';
    }
}

function handleServerStateUpdate(data) {
    const playerCount = data.players ? Object.keys(data.players).length : 0;

    if (data.state === 'waiting' || playerCount < 2) {
        gameInfoEl.innerHTML = `Waiting for opponent...<br><span style="font-size:1rem;color:#a0aabf;">Room ${data.code || roomCode} · ${playerCount}/2 players</span>`;
        return;
    }

    // Sync Roles
    myRole = data.players[playerId].role;

    // Sync Scores
    player1ScoreEl.innerText = data.score.P1;
    player2ScoreEl.innerText = data.score.P2;

    if (data.sudden_death && !isSuddenDeath) {
        isSuddenDeath = true;
        goalAreaEl.classList.add('sudden-death');
    }

    if (data.state === 'game_over') {
        const winnerName = data.winner === playerId ? 'YOU WON!' : 'OPPONENT WON!';
        document.getElementById('winner-text').innerText = winnerName;
        clearInterval(pollInterval);
        
        if (localState !== 'result') {
            switchScreen('game-over-menu');
        } else {
            // Let the result animation finish
            setTimeout(() => { switchScreen('game-over-menu'); }, 2000);
        }
        return;
    }

    if (data.state === 'playing') {
        resultOverlayEl.classList.add('hidden');
        if (data.turn_state === 'aiming') {
            resetElements();
            localState = 'aiming';
            updateGameInfo();
            if (myRole !== 'kicker') gameInfoEl.innerHTML = '<span style="font-size:1.5rem;">WAITING FOR KICKER...</span>';
        } else if (data.turn_state === 'diving') {
            localState = 'diving';
            updateGameInfo();
            if (myRole !== 'goalkeeper') gameInfoEl.innerHTML = '<span style="font-size:1.5rem;">WAITING FOR GOALKEEPER...</span>';
        }
    } else if (data.state === 'result' && localState !== 'result') {
        localState = 'result';
        animateResult(data.kicker_aim, data.goalkeeper_dive, data.result_message);
    }
}

// --- Interaction ---
kickAreaEl.addEventListener('click', async (e) => {
    if (localState === 'result') return;

    // Calculate click coordinates relative to the goal-area
    const goalRect = goalAreaEl.getBoundingClientRect();
    const x = (e.clientX - goalRect.left) / goalRect.width;
    const y = (e.clientY - goalRect.top) / goalRect.height;
    
    // Check if click was inside the net (accounting for 10px border and 20px ball radius)
    // Left post: x < 0.0375. Right post: x > 0.9625. Crossbar: y < 0.075. Ground: y > 1.0.
    let isMiss = x < 0.0375 || x > 0.9625 || y < 0.075 || y > 1.0;
    let missType = "MISS!";
    
    // Determine if it hit the post/crossbar specifically
    if (isMiss) {
        if (y >= 0 && y <= 0.075 && x >= 0 && x <= 1.0) {
            missType = "CROSSBAR!";
        } else if (y > 0.075 && y <= 1.0 && (x >= 0 && x <= 0.0375 || x >= 0.9625 && x <= 1.0)) {
            missType = "POST!";
        }
    }

    if (currentMode === 'multiplayer') {
        if ((localState === 'aiming' && myRole === 'kicker') || 
            (localState === 'diving' && myRole === 'goalkeeper')) {
            await submitAction({x, y, isMiss, missType});
        }
    } else {
        // Solo / World Cup AI
        if (myRole === 'kicker') {
            const aiDive = getAiGoalkeeperDive(x, y);
            processSoloResult({x, y, isMiss, missType}, aiDive);
        } else {
            const aiAim = getAiKickerAim();
            processSoloResult(aiAim, {x, y, isMiss: false});
        }
    }
});

async function submitAction(data) {
    try {
        await fetch(`${API_BASE}/action`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                code: roomCode,
                player: playerId,
                type: myRole === 'kicker' ? 'aim' : 'dive',
                coords: data // sending {x, y, isMiss}
            })
        });
    } catch (e) {
        console.error("Action error", e);
    }
}

function processSoloResult(kickData, diveCoords) {
    localState = 'result';

    let isSave = isGoalkeeperSave(kickData.x, kickData.y, diveCoords.x, diveCoords.y);
    let message = isSave ? "SAVE!" : "SCORE!";
    
    // Check Miss
    if (kickData.isMiss) {
        isSave = true;
        message = kickData.missType || "MISS!";
    } else if (!isSave && kickData.y > 0.075 && kickData.y <= 0.125) {
        message = "OFF CROSSBAR AND IN!";
    }
    
    // Only Kicker gets points
    if (!isSave) {
        if (myRole === 'kicker') player1ScoreEl.innerText = parseInt(player1ScoreEl.innerText) + 1;
        else player2ScoreEl.innerText = parseInt(player2ScoreEl.innerText) + 1;
    }

    if (myRole === 'kicker') kicksP1++;
    else kicksP2++;

    animateResult(kickData, diveCoords, message);

    // Check Win Condition
    let p1s = parseInt(player1ScoreEl.innerText);
    let p2s = parseInt(player2ScoreEl.innerText);
    let gameOver = false;
    let winner = null;
    
    if (kicksP1 === kicksP2) {
        if (kicksP1 >= 5) {
            if (p1s !== p2s) {
                gameOver = true;
                winner = p1s > p2s ? 'YOU WON!' : 'AI WON!';
            } else {
                if (!isSuddenDeath) {
                    isSuddenDeath = true;
                    goalAreaEl.classList.add('sudden-death');
                }
            }
        }
    } else {
        if (kicksP1 <= 5 && kicksP2 <= 5) {
            let remP1 = 5 - kicksP1;
            let remP2 = 5 - kicksP2;
            if (p1s > p2s + remP2) {
                gameOver = true;
                winner = 'YOU WON!';
            } else if (p2s > p1s + remP1) {
                gameOver = true;
                winner = 'AI WON!';
            }
        }
    }

    if (gameOver) {
        lastWinner = winner;
        setTimeout(() => {
            document.getElementById('winner-text').innerText = winner;
            switchScreen('game-over-menu');
        }, 2000);
    }
}

function postGameAction() {
    if (currentMode === 'worldcup') {
        const didWin = lastWinner === 'YOU WON!';
        tournament.advance(didWin);
    } else {
        showMainMenu();
    }
}

// --- Animations ---
// GK_HOME_X / GK_HOME_Y defined in hitbox.js

function getDivePose(diveCoords) {
    const toLeft = diveCoords.x < GK_HOME_X;
    const horiz = Math.abs(diveCoords.x - GK_HOME_X);
    const height = diveCoords.y;

    let rotate = 38 + horiz * 95;
    if (height < 0.32) {
        rotate *= 0.42;
    } else if (height > 0.62) {
        rotate = Math.min(95, rotate + 18);
    }

    const scaleX = height < 0.32 ? 1.02 : 1.12;
    const scaleY = height < 0.32 ? 0.98 : 0.88;

    return {
        rotate: toLeft ? -rotate : rotate,
        scaleX,
        scaleY
    };
}

function animateGoalkeeperDive(diveCoords) {
    const goalW = goalAreaEl.offsetWidth;
    const goalH = goalAreaEl.offsetHeight;
    const homeX = GK_HOME_X * goalW;
    const homeY = GK_HOME_Y * goalH;
    const targetX = diveCoords.x * goalW;
    const targetY = diveCoords.y * goalH;

    const pose = getDivePose(diveCoords);

    goalkeeperEl.classList.remove('gk-diving');
    goalkeeperEl.style.animation = 'none';
    void goalkeeperEl.offsetWidth;

    goalkeeperEl.style.left = `${GK_HOME_X * 100}%`;
    goalkeeperEl.style.top = `${GK_HOME_Y * 100}%`;
    goalkeeperEl.style.setProperty('--gk-dx', `${targetX - homeX}px`);
    goalkeeperEl.style.setProperty('--gk-dy', `${targetY - homeY}px`);
    goalkeeperEl.style.setProperty('--gk-rotate', `${pose.rotate}deg`);
    goalkeeperEl.style.setProperty('--gk-scale-x', String(pose.scaleX));
    goalkeeperEl.style.setProperty('--gk-scale-y', String(pose.scaleY));

    goalkeeperEl.style.animation = '';
    goalkeeperEl.classList.add('gk-diving');
}

function animateBallFlight(kickData) {
    const ballX = kickData.x * 100;
    const ballY = (1 - kickData.y) * 100;

    ballEl.classList.remove('ball-flying');
    ballEl.style.animation = 'none';
    void ballEl.offsetWidth;

    ballEl.style.left = '50%';
    ballEl.style.bottom = '-80px';
    ballEl.style.transform = 'translateX(-50%) scale(1)';
    ballEl.style.setProperty('--ball-target-x', `${ballX}%`);
    ballEl.style.setProperty('--ball-target-y', `${ballY}%`);

    ballEl.style.animation = '';
    ballEl.classList.add('ball-flying');
}

function animateResult(kickData, diveCoords, message) {
    // Set text color
    if (message === "SAVE!") resultTextEl.style.color = "#ff3366";
    else if (message === "CROSSBAR!") resultTextEl.style.color = "#00bbff";
    else if (message === "OFF CROSSBAR AND IN!") resultTextEl.style.color = "#ff33cc";
    else if (message === "MISS!" || message === "POST!") resultTextEl.style.color = "#ffaa00";
    else resultTextEl.style.color = "#00ff88";

    animateGoalkeeperDive(diveCoords);
    animateBallFlight(kickData);

    playSoundForMessage(message);

    setTimeout(() => {
        resultTextEl.innerText = message;
        resultOverlayEl.classList.remove('hidden');
        if (currentMode === 'multiplayer') {
            if (playerId === 'P1') {
                nextTurnBtnEl.classList.remove('hidden');
            } else {
                nextTurnBtnEl.classList.add('hidden');
                resultTextEl.innerText += "\n(Waiting for Host...)";
            }
        } else {
            nextTurnBtnEl.classList.remove('hidden');
        }
    }, 1000);
}

async function nextTurn() {
    if (currentMode === 'multiplayer') {
        await fetch(`${API_BASE}/next_turn`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ code: roomCode })
        });
    } else {
        // Solo Mode: Switch Roles manually
        myRole = myRole === 'kicker' ? 'goalkeeper' : 'kicker';
        resetRound();
        updateGameInfo();
    }
}

function resetRound() {
    localState = 'aiming';
    resultOverlayEl.classList.add('hidden');
    resetElements();
}

function resetElements() {
    goalkeeperEl.classList.remove('gk-diving');
    goalkeeperEl.style.animation = 'none';
    goalkeeperEl.style.left = '50%';
    goalkeeperEl.style.top = '65%';
    goalkeeperEl.style.transform = 'translate(-50%, -50%) rotate(0deg) scale(1, 1)';
    goalkeeperEl.style.removeProperty('--gk-dx');
    goalkeeperEl.style.removeProperty('--gk-dy');
    goalkeeperEl.style.removeProperty('--gk-rotate');
    goalkeeperEl.style.removeProperty('--gk-scale-x');
    goalkeeperEl.style.removeProperty('--gk-scale-y');

    ballEl.classList.remove('ball-flying');
    ballEl.style.animation = 'none';
    ballEl.style.left = '50%';
    ballEl.style.bottom = '-80px';
    ballEl.style.transform = 'translateX(-50%) scale(1)';
    ballEl.style.removeProperty('--ball-target-x');
    ballEl.style.removeProperty('--ball-target-y');
}

function updateGameInfo() {
    if (myRole === 'kicker') {
        gameInfoEl.innerHTML = '<span style="color:#00ff88; font-weight:900; font-size:2rem;">ROLE: KICKER</span><br>Click anywhere to shoot!';
    } else {
        gameInfoEl.innerHTML = '<span style="color:#00ddff; font-weight:900; font-size:2rem;">ROLE: GOALKEEPER</span><br>Click anywhere to dive!';
    }
}
