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
        roomDisplayEl.innerText = mode === 'worldcup' ? `World Cup Mode - ${team}` : 'Solo Mode';
        resetRound();
        updateGameInfo();
    }
}

// --- Multiplayer API Calls ---
async function createRoom() {
    try {
        const res = await fetch(`${API_BASE}/create_room`, { method: 'POST', body: JSON.stringify({}) });
        const data = await res.json();
        roomCode = data.code;
        playerId = data.player;
        myRole = data.role;
        currentMode = 'multiplayer';
        
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
        
        roomCode = code;
        playerId = data.player;
        myRole = data.role;
        currentMode = 'multiplayer';
        
        switchScreen('game-screen');
        roomDisplayEl.innerText = `Room Code: ${roomCode}`;
        
        startPolling();
    } catch (e) {
        alert("Make sure the backend server is running (same URL as this page).");
    }
}

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/room_state?code=${roomCode}&player=${playerId}`);
            const data = await res.json();
            if (!data.error) {
                handleServerStateUpdate(data);
            }
        } catch (e) {
            console.error("Polling error", e);
        }
    }, 500);
}

function handleServerStateUpdate(data) {
    if (data.state === 'waiting') {
        gameInfoEl.innerText = 'Waiting for opponent...';
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
        // Solo Mode Logic
        if (myRole === 'kicker') {
            // AI Goalkeeper dive (random coordinates inside goal)
            const aiDive = { 
                x: 0.2 + (Math.random() * 0.6), // dive mostly central
                y: 0.5 + (Math.random() * 0.5) 
            };
            processSoloResult({x, y, isMiss, missType}, aiDive);
        } else {
            // AI Kicker aim
            const aiAim = { 
                x: 0.2 + (Math.random() * 0.6), 
                y: 0.2 + (Math.random() * 0.8),
                isMiss: Math.random() > 0.9, // 10% chance AI misses
                missType: "MISS!"
            };
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
    
    // The goalie's center is at diveCoords. Their body extends roughly 0.35 up and down.
    // We create a vertical line segment representing the goalie's torso.
    const px = kickData.x, py = kickData.y;
    const x1 = diveCoords.x, y1 = diveCoords.y - 0.30;
    const x2 = diveCoords.x, y2 = diveCoords.y + 0.30;
    
    const l2 = (x1 - x2)**2 + (y1 - y2)**2;
    let dist = 0;
    if (l2 === 0) {
        dist = Math.sqrt((px - x1)**2 + (py - y1)**2);
    } else {
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + t * (x2 - x1);
        const projY = y1 + t * (y2 - y1);
        dist = Math.sqrt((px - projX)**2 + (py - projY)**2);
    }
    
    let isSave = dist < 0.15; // If ball is within 15% (120px) of the goalie's body, it's a save!
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
function animateResult(kickData, diveCoords, message) {
    const goalWidth = goalAreaEl.offsetWidth;
    const goalHeight = goalAreaEl.offsetHeight;

    // Set text color
    if (message === "SAVE!") resultTextEl.style.color = "#ff3366";
    else if (message === "CROSSBAR!") resultTextEl.style.color = "#00bbff";
    else if (message === "OFF CROSSBAR AND IN!") resultTextEl.style.color = "#ff33cc"; // Pink
    else if (message === "MISS!" || message === "POST!") resultTextEl.style.color = "#ffaa00";
    else resultTextEl.style.color = "#00ff88"; // SCORE uses green

    // Move Goalkeeper (diveCoords are relative to kick-area now)
    const gkX = (diveCoords.x * 100);
    const gkY = (diveCoords.y * 100);
    
    // Natural dive animation using skew and translate
    const skewAmount = diveCoords.x > 0.5 ? 20 : -20;
    goalkeeperEl.style.left = `${gkX}%`;
    goalkeeperEl.style.top = `${gkY}%`;
    goalkeeperEl.style.transform = `translate(-50%, -50%) skewX(${skewAmount}deg)`;

    // Move Ball (kickData are relative to kick-area)
    const ballX = (kickData.x * 100);
    const ballY = (1 - kickData.y) * 100;
    ballEl.style.left = `${ballX}%`;
    ballEl.style.bottom = `${ballY}%`;
    ballEl.style.transform = `translateX(-50%) scale(0.5)`; 

    // Play Audio
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
    }, 1000); // wait for animation
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
    goalkeeperEl.style.left = '50%';
    goalkeeperEl.style.top = '65%';
    goalkeeperEl.style.transform = 'translate(-50%, -50%) skewX(0deg)';
    
    ballEl.style.left = '50%';
    ballEl.style.bottom = '-80px';
    ballEl.style.transform = 'translateX(-50%) scale(1)';
}

function updateGameInfo() {
    if (myRole === 'kicker') {
        gameInfoEl.innerHTML = '<span style="color:#00ff88; font-weight:900; font-size:2rem;">ROLE: KICKER</span><br>Click anywhere to shoot!';
    } else {
        gameInfoEl.innerHTML = '<span style="color:#00ddff; font-weight:900; font-size:2rem;">ROLE: GOALKEEPER</span><br>Click anywhere to dive!';
    }
}
