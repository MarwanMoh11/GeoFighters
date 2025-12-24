import { state } from '../state.js';

export function initializeAudio() {
    if (!state.audioContext && (window.AudioContext || window.webkitAudioContext)) {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (state.audioContext.state === 'suspended') {
            const resumeAudio = () => {
                if (state.audioContext.state === 'suspended') {
                    state.audioContext.resume().catch(e => console.error("AudioContext resume error:", e));
                }
                document.body.removeEventListener('click', resumeAudio);
                document.body.removeEventListener('touchstart', resumeAudio);
            };
            document.body.addEventListener('click', resumeAudio, { once: true });
            document.body.addEventListener('touchstart', resumeAudio, { once: true });
        }
    }
}

export function playSoundSynth(type = 'hit', volume = 0.3, options = {}) {
    if (!state.audioContext || state.audioContext.state !== 'running') return;
    const ctx = state.audioContext;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const finalVolume = volume * 0.8;
    gain.gain.setValueAtTime(finalVolume, now);

    switch (type) {
        case 'shoot_basic':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(options.pitch || 660, now);
            osc.frequency.exponentialRampToValueAtTime(330, now + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;
        case 'enemy_hit':
            osc.type = 'square';
            osc.frequency.setValueAtTime(options.pitch || 220, now);
            osc.frequency.linearRampToValueAtTime(110, now + 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
            break;
        case 'enemy_death':
            osc.type = 'sawtooth';
            const basePitch = options.isLarge ? 100 : 150;
            osc.frequency.setValueAtTime(basePitch, now);
            osc.frequency.exponentialRampToValueAtTime(basePitch * 0.5, now + 0.2);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
            const noiseSource = ctx.createBufferSource();
            const bufferSize = Math.floor(ctx.sampleRate * 0.15);
            const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
            noiseSource.buffer = noiseBuffer;
            const noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(finalVolume * 0.4, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            noiseSource.connect(noiseGain);
            noiseGain.connect(ctx.destination);
            noiseSource.start(now);
            noiseSource.stop(now + 0.15);
            break;
        case 'player_hit':
            osc.type = 'square';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.setValueAtTime(160, now + 0.05);
            osc.frequency.setValueAtTime(180, now + 0.1);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;
        case 'pickup_xp':
            osc.type = 'sine';
            const xpPitch = options.pitch || 880;
            osc.frequency.setValueAtTime(xpPitch, now);
            osc.frequency.linearRampToValueAtTime(xpPitch * 1.5, now + 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
            break;
        case 'pickup_health':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
            break;
        case 'level_up':
            const baseFreq = 261.63;
            const freqs = [baseFreq, baseFreq * 1.2599, baseFreq * 1.4983, baseFreq * 2];
            const dur = 0.12;
            freqs.forEach((freq, i) => {
                const oscL = ctx.createOscillator();
                const gainL = ctx.createGain();
                oscL.type = 'triangle';
                oscL.frequency.setValueAtTime(freq, now + i * dur);
                gainL.gain.setValueAtTime(finalVolume * 0.5, now + i * dur);
                gainL.gain.exponentialRampToValueAtTime(0.001, now + (i + 0.9) * dur);
                oscL.connect(gainL);
                gainL.connect(ctx.destination);
                oscL.start(now + i * dur);
                oscL.stop(now + (i + 1) * dur);
            });
            break;
        case 'upgrade_buy':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(783.99, now);
            osc.frequency.linearRampToValueAtTime(1046.50, now + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;
        case 'error':
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.linearRampToValueAtTime(100, now + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;
    }
}

// =================================================================================
// --- AMBIENT MUSIC SYSTEM ---
// =================================================================================

let musicGainNode = null;
let musicOscillators = [];
let isMusicPlaying = false;

/**
 * Starts an ambient synthwave-style music loop.
 * Uses multiple oscillators to create a layered atmosphere.
 */
export function startAmbientMusic() {
    if (!state.audioContext || isMusicPlaying) return;

    const ctx = state.audioContext;
    if (ctx.state === 'suspended') return; // Don't start if audio isn't unlocked

    isMusicPlaying = true;

    // Master gain for music
    musicGainNode = ctx.createGain();
    musicGainNode.gain.setValueAtTime(0, ctx.currentTime);
    musicGainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 2); // Fade in over 2s
    musicGainNode.connect(ctx.destination);

    // Bass drone
    const bassOsc = ctx.createOscillator();
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(55, ctx.currentTime); // A1
    const bassGain = ctx.createGain();
    bassGain.gain.setValueAtTime(0.4, ctx.currentTime);
    bassOsc.connect(bassGain);
    bassGain.connect(musicGainNode);
    bassOsc.start();
    musicOscillators.push({ osc: bassOsc, gain: bassGain });

    // Pad layer 1
    const padOsc1 = ctx.createOscillator();
    padOsc1.type = 'triangle';
    padOsc1.frequency.setValueAtTime(110, ctx.currentTime); // A2
    const padGain1 = ctx.createGain();
    padGain1.gain.setValueAtTime(0.15, ctx.currentTime);
    padOsc1.connect(padGain1);
    padGain1.connect(musicGainNode);
    padOsc1.start();
    musicOscillators.push({ osc: padOsc1, gain: padGain1 });

    // Pad layer 2 (detuned for width)
    const padOsc2 = ctx.createOscillator();
    padOsc2.type = 'triangle';
    padOsc2.frequency.setValueAtTime(111.5, ctx.currentTime); // Slightly detuned
    const padGain2 = ctx.createGain();
    padGain2.gain.setValueAtTime(0.1, ctx.currentTime);
    padOsc2.connect(padGain2);
    padGain2.connect(musicGainNode);
    padOsc2.start();
    musicOscillators.push({ osc: padOsc2, gain: padGain2 });

    // High shimmer
    const shimmerOsc = ctx.createOscillator();
    shimmerOsc.type = 'sine';
    shimmerOsc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0.02, ctx.currentTime);
    shimmerOsc.connect(shimmerGain);
    shimmerGain.connect(musicGainNode);
    shimmerOsc.start();
    musicOscillators.push({ osc: shimmerOsc, gain: shimmerGain });
}

/**
 * Fades out and stops the ambient music.
 * @param {number} fadeTime - Fade duration in seconds (default: 1.5)
 */
export function stopAmbientMusic(fadeTime = 1.5) {
    if (!musicGainNode || !isMusicPlaying) return;

    const ctx = state.audioContext;
    const now = ctx.currentTime;

    // Fade out
    musicGainNode.gain.linearRampToValueAtTime(0, now + fadeTime);

    // Stop oscillators after fade
    setTimeout(() => {
        musicOscillators.forEach(({ osc }) => {
            try { osc.stop(); } catch (e) { /* Already stopped */ }
        });
        musicOscillators = [];
        musicGainNode = null;
        isMusicPlaying = false;
    }, fadeTime * 1000 + 100);
}