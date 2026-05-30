// src/linkClock.ts
// A local linear model of the shared Link beat clock in terms of the audio
// clock. Fed from the link bridge's 20 Hz messages (tempo + beat), timestamped
// with AudioContext.currentTime at arrival. Pure given its state; used by the
// scheduler to snap note onsets to a beat grid.
const EPS = 1e-9;

export class LinkClock {
  private tempo = 120;
  private beatRef = 0;
  private timeRef = 0;
  private _valid = false;

  get valid(): boolean {
    return this._valid;
  }

  // beat: the Link beat position as of audioNow (AudioContext.currentTime).
  update(tempo: number, beat: number, audioNow: number): void {
    this.tempo = tempo;
    this.beatRef = beat;
    this.timeRef = audioNow;
    this._valid = true;
  }

  reset(): void {
    this._valid = false;
  }

  beatAt(t: number): number {
    return this.beatRef + (t - this.timeRef) * (this.tempo / 60);
  }

  timeAtBeat(b: number): number {
    return this.timeRef + (b - this.beatRef) * (60 / this.tempo);
  }

  // The next grid line (in seconds, audio clock) at or after t. subdivBeats=0.5
  // is a half-beat (eighth-note) grid. Identity passthrough while invalid.
  nextGridTime(t: number, subdivBeats = 0.5): number {
    if (!this._valid) return t;
    const beat = this.beatAt(t);
    const gridBeat = Math.ceil(beat / subdivBeats - EPS) * subdivBeats;
    return this.timeAtBeat(gridBeat);
  }
}
