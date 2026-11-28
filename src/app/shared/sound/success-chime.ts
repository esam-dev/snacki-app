/**
 * Sonido corto de "puntos sumados": dos notas ascendentes tipo moneda.
 * Se sintetiza con Web Audio (sin archivos). Si el navegador no lo permite, no hace nada.
 */
let ctx: AudioContext | null = null;

export function playSuccessChime(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();

    const start = ctx.currentTime + 0.01;
    // Mi6 → La6: brillante y breve, se oye bien en el mostrador sin molestar.
    [
      { freq: 1318.5, at: 0, dur: 0.09 },
      { freq: 1760, at: 0.085, dur: 0.22 },
    ].forEach(({ freq, at, dur }) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start + at);
      gain.gain.setValueAtTime(0.0001, start + at);
      gain.gain.exponentialRampToValueAtTime(0.28, start + at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + at + dur);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start + at);
      osc.stop(start + at + dur + 0.02);
    });
  } catch {
    // El sonido es un extra: nunca debe romper la acción.
  }
}
