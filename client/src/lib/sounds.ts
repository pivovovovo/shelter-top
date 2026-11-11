// Генерация звуков через Web Audio API — работает без .mp3 файлов
let audioCtx: AudioContext | null = null;

const getCtx = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
};

const playTone = (freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.1) => {
  try {
    const ctx = getCtx();
    // Если контекст на паузе (браузер блокирует звук до первого клика), возобновляем его
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Игнорируем, если браузер заблокировал звук
  }
};

export const sounds = {
  // Клик по кнопке
  click: () => playTone(800, 0.06, 'square', 0.05),

  // Успех (например, карта сработала)
  success: () => {
    playTone(523, 0.1, 'sine', 0.1); // C5
    setTimeout(() => playTone(659, 0.15, 'sine', 0.1), 80); // E5
  },

  // Ошибка
  error: () => {
    playTone(200, 0.2, 'sawtooth', 0.08);
  },

  // Открытие/закрытие BottomSheet
  sheet: () => playTone(400, 0.08, 'sine', 0.06),

  // Раскрытие карточки
  reveal: () => playTone(1200, 0.08, 'triangle', 0.06),

  // Исключение / Game Over (низкий "бум")
  boom: () => {
    playTone(120, 0.4, 'sine', 0.15);
    setTimeout(() => playTone(80, 0.6, 'sine', 0.12), 100);
  },

  // Голос отдан
  vote: () => playTone(600, 0.1, 'triangle', 0.08),
};