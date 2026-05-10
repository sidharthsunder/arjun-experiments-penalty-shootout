const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playPostSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    // Metal clank simulation
    const freqs = [600, 1200, 2400];
    freqs.forEach(f => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        
        gain.gain.setValueAtTime(1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    });
}

const cheerAudio = new Audio('cheer1.mp3');
const booAudio = new Audio('boo1.mp3');

function playCheerSound() {
    cheerAudio.currentTime = 0;
    cheerAudio.play().catch(e => console.error("Audio play blocked", e));
}

function playBooSound() {
    booAudio.currentTime = 0;
    booAudio.play().catch(e => console.error("Audio play blocked", e));
}

function playSoundForMessage(message) {
    // Some browsers block audio context until the first user interaction.
    // By the time this is called, the user has clicked, so it's safe.

    if (message === "POST!" || message === "CROSSBAR!") {
        playPostSound();
        setTimeout(playBooSound, 200);
    } else if (message === "SCORE!" || message === "OFF CROSSBAR AND IN!") {
        if (message === "OFF CROSSBAR AND IN!") {
            playPostSound();
            setTimeout(playCheerSound, 200);
        } else {
            playCheerSound();
        }
    } else if (message === "SAVE!") {
        playBooSound();
    } else if (message === "MISS!") {
        playBooSound();
    }
}
