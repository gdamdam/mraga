# Phrase-engine upgrade (Wave 2A)

Four interacting melodic-engine features layered on the pure, seeded engine:
rhythm cells, tihai, vakra transitions, dynamics contour. Written test-first.

## Non-negotiable: RNG-stream compatibility

The engine is pure and seeded (`rng()` is the only entropy source). Old share
links must replay the SAME melody. Therefore **at default settings the number
and order of `rng()` draws must be byte-identical to today's code**, exactly the
discipline gamaka already follows ("Disabled (default) consumes NO rng").

Rule applied here: every feature that would consume a draw today's code does not
is gated behind a scene-versioned boolean flag whose **default (off/undefined)
consumes ZERO new draws** and takes the exact pre-existing code path. The
dynamics contour is the only always-on change; it consumes **no new draw** — it
only remaps the value of the existing velocity draw (pitch/rhythm/rng untouched).

### Gating summary

| Feature         | Flag (default)              | New draws when ON            | Default note stream |
|-----------------|-----------------------------|------------------------------|---------------------|
| Rhythm cells    | `rhythmCellsEnabled` (false)| fire + cell-pick (≤2/phrase) | identical           |
| Tihai           | `tihaiEnabled` (false) + taal| 1 fire decision/phrase-build| identical           |
| Vakra           | `vakraEnabled` (false)      | none (rng-neutral remap)     | identical           |
| Dynamics arch   | always on                   | none (remaps existing draw)  | pitch/rhythm identical; velocity intentionally remapped |

**RNG-compat statement:** at defaults (all three flags off/undefined,
`matraPosition` absent) the rng draw order and the pitch+rhythm sequence are
byte-identical to pre-change — proven by a golden regression test
(`engineUpgrade.golden.json`, captured from the pre-change engine). Velocities
differ by design (dynamics arch), deterministically, with no extra draws.

## 1. Rhythm cells

Replaces the per-note `steps.map(() => rng()<longNoteProb?2:1)` (which draws one
rng per note) with a per-phrase cell chosen from a small vocabulary:
`[1,1,2]`, `[0.5,0.5,1]`, `[1,0.5,0.5,2]`, triplet `[2/3,2/3,2/3]`, plus the
plain `[1]`/`[2]` feel. IOI stays `baseIoi × cellValue` so the pulse grid
survives quantization. The cell is tiled across the phrase (`cell[i % len]`).
Weighting: subdivisions (0.5, thirds) only gain weight at higher `density`;
loose `rhythm` (rubato) keeps weight on plain 1s/2s. The vocabulary SOMETIMES
does not fire — a fire draw decides, else the phrase falls back to the plain
per-note rhythm (four looping patterns is just a different monotony).

Gated by `rhythmCellsEnabled`. OFF ⇒ the exact original per-note loop (same
draws). ON ⇒ draws one fire rng, and if firing one weighted pick rng.

## 2. Tihai (flagship)

When a taal is active and `tihaiEnabled` is on, a phrase-build near sam may
become a tihai: the last motif (figure) played 3× with equal gaps so the line
resolves EXACTLY on sam. Emitted as a normal precomputed phrase (steps + rhythm)
— no scheduler/MIDI change. Gaps are realized as **extended held final notes**
of statements 1 & 2 (no rest events needed), then an explicit landing note on
sam.

### Matra arithmetic (integer, exhaustively tested)

App passes `matraPosition` (fractional beat = `clock.beatAt(previewOnset(now))`)
and `cycleMatras` (`taal.matras`). The engine derives an integer distance `D`
(matras from the tihai's grid start to the target sam):

```
startMatra = round(matraPosition)
posInCycle = ((startMatra % C) + C) % C
D0         = (C - posInCycle) % C ; if 0 → C   // matras to next sam
D          = D0, +C while D < 3·Fmin and D ≤ ⌈1.5·C⌉   // fit ≥3 figures, ≤1.5 cycles
```

Solver (integer ticks, subdivision `U = 6` covers halves and thirds):

```
Ft = Σ figureCells · U ; Dt = D · U
find smallest pad p ≥ 0 (ticks) s.t. N = Dt − 3·(Ft+p) is even and ≥ 0
gapTicks = N / 2
layout: [fig | last note +gap] ×2, then [fig] (last +pad), then landing note on sam
onset(landing) = 3·(Fdur+pad) + 2·gap = D  ⇒ lands on sam
```

Padding the figure's final note by `p` shifts `3·Fdur` by `3p`, flipping the
parity of `N` when `p` is odd — so a single-tick pad resolves any parity miss;
if `3·Fdur > D` even after trying `D+C`, no tihai fires (returns null, falls
through to a normal phrase). Guaranteed identity tested: `3·(Fdur+pad)+2·gap == D`
for all 4 taals × several figure lengths × fractional cells.

### Firing probability

Only draws rng when a tihai is actually buildable (taal + `matraPosition` +
`cycleMatras` + a prior motif + a valid `D`). One draw: `rng() < fireProb`,
`fireProb = 0.10 + 0.22·theme` (theme derived from `repeatProb`). Conservative:
phrase-builds near sam are a fraction of all builds, so at theme≈0.5 this yields
roughly one tihai every 3–6 cycles, not every cycle. Gated by `tihaiEnabled`.

## 3. Vakra transitions

`Raga.avarohaPath?: number[]` — the authored crooked descent order (Desh:
`S' n D P D m G R S`; Khamaj avaroha similar). Threaded as
`EngineParams.avarohaPath` and used only when `vakraEnabled`.

Two changes, both **rng-neutral** (mask/path lookups consume no draws), gated by
`vakraEnabled` so raga share-links stay byte-identical when off:
1. **Segment direction, not per-step**: the aroha/avaroha mask is chosen once per
   segment from `sign(target − curStep)` instead of per individual step/delta
   (fixes the flicker at engine.ts ~221/260 where a momentary counter-step
   flipped the palette). At defaults (no raga) `up === down`, so this is
   output-neutral anyway; gating protects multi-mask ragas.
2. **Authored successor**: while descending with a path present, prefer the
   path's successor degree over pure nearest-allowed, so the crooked order
   (…P → D → m…) is honored.

Sets remain the fallback where no path is authored.

## 4. Dynamics contour

Velocity was flat (`0.6 + rng·0.2` + small bonuses). Added a phrase-level arch,
a pure function of phrase position/shape (NO new draw — the existing velocity
draw is kept and only remapped):
- swell toward the phrase's registral peak (note furthest from register centre),
- soften the phrase-final note,
- taal accent (`tAccent`) stays multiplicative on top.

Seed-safe by construction: same seed ⇒ same draws ⇒ same deterministic contour.

## New EngineParams / Raga fields

```
EngineParams:
  rhythmCellsEnabled?: boolean   // default false
  tihaiEnabled?: boolean         // default false
  vakraEnabled?: boolean         // default false
  avarohaPath?: number[]         // authored crooked descent (degrees)
  matraPosition?: number         // fractional beat position (App: clock.beatAt(previewOnset(now)))
  cycleMatras?: number           // taal.matras
Raga:
  avarohaPath?: number[]
```
