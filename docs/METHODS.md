# The Mathematics of Beacon

### A deterministic, glass-box model for matching people to cities

*Methods report — written to be developable into a paper. Every constant
below is quoted from the shipped code; every claimed property names the
automated test that pins it.*

---

## Abstract

Beacon is a city-recommendation system built under an unusual constraint:
**no learned model, no randomness, and no number a user cannot trace**.
Twenty-seven survey responses are compiled into a preference profile; 173
cities, each described by a mixed researched/authored attribute vector, are
scored by a weighted aggregation of per-dimension *fit functions*; the result
is a total order over cities. The interesting modeling content is that five
of the fourteen dimensions are deliberately **non-symmetric**: language is
treated as a *capability*, cost as a *monotone one-sided penalty with a
quality-gated exception*, safety as an *aspiration level with a personal
escape valve*, diversity as *one-sided care*, and visa access as a
*rule-derived tier system*. We state the model exactly, prove its invariants
(determinism, boundedness, cost monotonicity, null-information neutrality,
per-answer stability ≤ ~2 points), relate it to multi-attribute utility
theory and satisficing, and catalog its honest limitations as open problems.

---

## 1. Preliminaries and notation

Let $\mathcal{C}$ be the city set, $|\mathcal{C}| = 173$. Each city
$c \in \mathcal{C}$ carries:

- an attribute vector $d_c \in [0,10]^{12}$ over the dimension set
  $\mathcal{D} = \{$pace, nature, culture, social, warmth, afford, food,
  transit, openness, scale, safe, div$\}$;
- a **cost level** $\gamma_c \in [1,10]$ (Numbeo *Cost of Living Plus Rent
  Index* divided by 10, clamped; New York $=10.0$, Kathmandu $\approx 1.5$);
- a language set $L_c$ and an English-friendliness flag $e_c \in \{0,1\}$;
- an industry set $I_c$ (2–4 of 8 field labels);
- a country $\kappa_c$ (used by the visa rule system).

Attribute provenance is mixed and disclosed: `safe` is the Numbeo Safety
Index $/10$; `afford` is derived, $\mathrm{afford}_c = \mathrm{clamp}(10 -
\mathrm{round}(\gamma_c),\, 0, 10)$; nine dimensions (pace, nature, culture,
social, warmth, food, transit, openness, scale) and `div` are hand-authored
integer judgments on $[0,10]$.

A user is summarized by a profile
$u = (u_1,\dots,u_{12};\ t,\ \Lambda,\ \ell,\ \tau,\ Q,\ P)$ where
$u_k \in [0,10]$ are dimension targets, $t \in [0,10]$ is budget tolerance,
$\Lambda$ a language set, $\ell \in \{0,3,6,9\}$ willingness-to-learn,
$\tau \in \{\text{culture},\text{cheap},\text{nature},\text{none}\}$ the
safety tradeoff, $Q$ an (ordered pair of) quality dimensions or $\varnothing$,
and $P$ a set of resolved passports.

---

## 2. Preference elicitation: compiling 27 answers into $u$

The questionnaire has 9 sliders, 15 four-option cards, 2 multi-select
questions (languages, passports), and 1 field chip. Compilation
(`buildUser`, `src/scoring.js`) is a two-pass fold:

**Pass 1 (direct elicitation).** Every slider assigns its dimension
directly: $u_k \leftarrow a_k$. The budget slider is special:
$t \leftarrow a_{\text{budget}}$ and $u_{\text{afford}} \leftarrow 10 -
a_{\text{budget}}$ (the latter used only for display/compare, never scoring).
All unset dimensions start at the neutral prior $u_k = 5$.

**Pass 2 (indirect refinement).** Each chosen card option $o$ carries an
authored effect vector $f_o \in \{-3,\dots,3\}^{\mathcal D}$ (sparse). The
update is attenuated and clamped:

$$u_k \leftarrow \mathrm{clamp}\!\left(u_k + 0.7\, f_{o,k},\ 0,\ 10\right).$$

The attenuation $0.7$ is a saturation guard: with 15 cards speaking, raw
effects would pin many users to the clamp boundary and destroy
discrimination.

**Remark (a known wart worth fixing in a paper).** Because the clamp is
applied *per update* rather than to the summed effect, Pass 2 is
order-dependent *when the clamp binds mid-sequence*: for a dimension pushed
past a boundary and back, $\mathrm{clamp}(\mathrm{clamp}(x+a)+b) \neq
\mathrm{clamp}(x+a+b)$ in general. The question order is fixed, so the system
remains deterministic — but the compiled profile is a function of the
question *sequence*, not merely the answer *multiset*. Sum-then-clamp would
restore commutativity; we note it as a deliberate v2 target.

Capability parameters come from dedicated answers:
$\ell = (9,6,3,0)[a_{\text{langlearn}}]$,
$\tau = (\text{culture},\text{cheap},\text{nature},\text{none})[a_{\text{safetrade}}]$,
$Q = \big((\text{transit},\text{safe}),(\text{food},\text{culture}),(\text{nature},\text{transit}),\varnothing\big)[a_{\text{worthit}}]$,
$\Lambda$ defaults to $\{\text{english}\}$ if empty, and $P$ resolves
passport labels through the visa module.

---

## 3. The scoring function

### 3.1 Symmetric core

For the nine *taste* dimensions
$\mathcal{W} = \{$pace, nature, culture, social, warmth, food, transit,
openness, scale$\}$, fit is normalized city-block distance:

$$\varphi_k(c,u) = 1 - \frac{|d_{c,k} - u_k|}{10} \in [0,1],$$

with weights

| $k$ | pace | nature | culture | social | warmth | food | transit | openness | scale |
|---|---|---|---|---|---|---|---|---|---|
| $w_k$ | 1.15 | 1 | 1 | 1 | 1.05 | 0.9 | 0.9 | 0.8 | 1.05 |

($\sum_{\mathcal W} w_k = 8.85$.) These weights are designer-set, not
elicited — see §7.

### 3.2 Language: a capability, not a preference

$$\varphi_{\text{lang}}(c,u) =
\begin{cases}
1 & \Lambda \cap L_c \neq \varnothing\\
0.8 + 0.02\,\ell & e_c = 1 \ \wedge\ \text{english} \in \Lambda\\
0.3 + 0.06\,\ell & \text{otherwise}
\end{cases}$$

with weight $1.2$. Shared language dominates everything
($\varphi = 1$ regardless of $\ell$); English-friendliness yields
$[0.80, 0.98]$; the cold-start branch spans $[0.30, 0.84]$, so a declared
dealbreaker ($\ell = 0$) imposes a $0.7$ fit deficit — empirically enough to
pin same-language cities to the top (test: *"a language dealbreaker pins
matching-language cities to the top"*).

### 3.3 Cost: one-way, monotone, with a quality-gated exception

Define the comfort threshold $T(t) = 2 + 0.8t \in [2,10]$ and the *gentle
baseline* $g(c) = 1 - 0.012\,\gamma_c$. With quality dividend
$q(c) = \tfrac{1}{20}\big(d_{c,Q_1} + d_{c,Q_2}\big) \in [0,1]$ when
$Q \neq \varnothing$ (else $q \equiv 0$):

$$\varphi_{\text{cost}}(c,u) =
\begin{cases}
g(c) & \gamma_c \le T(t)\\[2pt]
\mathrm{clamp}\Big(g(c) - (\gamma_c - T)\cdot 0.13\,(1.35 - 0.85\,q(c)),\ 0,\ 1\Big) & \gamma_c > T(t)
\end{cases}$$

with weight $1.15$. The over-budget penalty rate per unit excess lies in
$[0.0650,\ 0.1755]$, i.e. the *named* quality (working infrastructure,
culture, or nature) can soften the cliff by up to $2.7\times$, but only
beyond the knee — never inside the comfort zone.

This shape encodes the product requirement exactly as stated by its one
user-author: *"more expensive places shouldn't be ranked better for cost of
living even if someone said they are willing to pay more — only if that
additional cost translates into a tangible improvement."* Budget tolerance
moves the knee; it never converts expense into virtue.

### 3.4 Safety: an aspiration level with a personal escape valve

Requirement $r = 0.9\,u_{\text{safe}}$; gap
$\delta = \max(0,\ r - d_{c,\text{safe}})$; forgiveness

$$F(c,\tau) = 0.45 \cdot \mathbb{1}\big[\text{cond}_\tau(c)\big],\qquad
\text{cond}_\tau: \begin{cases}
\tfrac{1}{2}(d_{c,\text{culture}} + d_{c,\text{food}}) \ge 7.5 & \tau=\text{culture}\\
\gamma_c \le 3 & \tau=\text{cheap}\\
d_{c,\text{nature}} \ge 8 & \tau=\text{nature}\\
\text{false} & \tau=\text{none}
\end{cases}$$

$$\varphi_{\text{safe}} = \mathrm{clamp}\Big(1 - \tfrac{\delta}{10}\cdot 1.3\,(1 - F),\ 0,\ 1\Big),
\qquad w_{\text{safe}} = 0.7 + 0.06\,u_{\text{safe}} \in [0.7, 1.3].$$

Two coupled asymmetries: the *fit* is one-sided (exceeding the requirement
earns nothing), and the *weight* scales with declared care. The forgiveness
condition is the formal version of "what makes a less safe place worth it
depends individual by individual" — it fires only where the city delivers
the user's chosen compensator (test: nature-trade softens Rio but not
Johannesburg, whose nature score doesn't qualify).

### 3.5 Diversity: doubly one-sided

$$\varphi_{\text{div}} = \mathrm{clamp}\big(1 - 0.11\,\max(0,\ u_{\text{div}} - d_{c,\text{div}}),\ 0, 1\big),
\qquad w_{\text{div}} = 0.3 + 0.07\,u_{\text{div}} \in [0.3, 1.0].$$

Wanting diversity a city lacks is penalized; a city *exceeding* the want is
not, and at $u_{\text{div}} = 0$ the fit is identically $1$ while the weight
bottoms out — "not caring" removes the dimension rather than rewarding
homogeneity (test: *"caring favors mixed cities; not caring penalizes no
one"*).

### 3.6 Visas: a rule system, not a score

Access is the join (max) over held passports under the total order
home $\succ$ union $\succ$ free $\succ$ evisa $\succ$ visa $\succ$ no,
computed by: (i) home-country membership (incl. territories: Puerto
Rico↦US, Scotland↦UK); (ii) bloc rules — EU/EEA/CH freedom of movement, the
UK→Ireland Common Travel Area, trans-Tasman, and the Mercosur residence
agreement for $\{$BR, AR, CL, CO$\}$ passports into six South American
destinations; (iii) per-country entry lists (visa-free / e-visa / closed,
with `ALL` wildcards), group-level by design. Then

$$\varphi_{\text{visa}} \in \{1,\ 1,\ 0.85,\ 0.7,\ 0.5,\ 0.15\}$$

respectively, with weight $w_{\text{visa}} = \mathbb{1}[P \neq \varnothing]$.
The zero weight under no information is a *null-information neutrality*
device (Prop. 3).

### 3.7 Aggregation and display

$$\bar\varphi(c,u) = \frac{\sum_k w_k\,\varphi_k}{\sum_k w_k},
\qquad
S_{\mathrm{raw}}(c,u) = 100\,\bar\varphi^{\,\beta} + 6\cdot\mathbb{1}[\text{field} \in I_c],
\qquad \beta = 2.1.$$

Total weight $\sum_k w_k \in [12.2,\ 14.5]$ depending on $u_{\text{safe}},
u_{\text{div}}, P$. Ranking sorts by $S_{\mathrm{raw}}$ descending with
alphabetical tiebreak (a total order ⇒ full determinism). The display score
is $\mathrm{clamp}(\mathrm{round}(S_{\mathrm{raw}}), 1, 99)$ — the clamp is a
*calibration honesty* device: the model never claims certainty (0 or 100),
and equal rounded scores are shown as genuine ties.

**Why the power $\beta$.** Averages of 12–14 bounded fits concentrate (most
cities land in $\bar\varphi \in [0.6, 0.95]$), which reads as "everything is
a 90% match." The convex transform expands top-end differences by factor
$\beta\,\bar\varphi^{\beta-1}$ ($\approx 1.86$ at $\bar\varphi = 0.95$)
while preserving order — a monotone recalibration, not a re-ranking.

**A wart, disclosed:** the industry bonus is added *after* the power, in
display-score units. It is order-preserving within each field class but
breaks the interpretation of $S$ as a transformed mean; folding it in as a
fifteenth fit dimension is the cleaner formulation.

---

## 4. Formal properties

Each property is enforced by a named test in `test/` (node's built-in
runner; CI runs them on every push).

**Prop. 1 (Determinism).** $S_{\mathrm{raw}}$ and the induced ranking are
pure functions of $(c, u)$; the scoring path contains no randomness, clock,
or I/O. *Test: "same answers always produce the same ranking."*

**Prop. 2 (Totality / boundedness).** For every $u$ in the reachable answer
space and every $c$, the display score lies in $[1, 99]$. *Test: "every city
gets a score in [1,99], no negatives ever"* — exercised at all-extreme answer
vectors.

**Prop. 3 (Null-information neutrality).** If $P = \varnothing$, the ranking
is identical to the model without the visa dimension (weight 0, fit 1).
*Test: "no passports selected leaves the ranking identical to pre-visa
scoring"* (asserted as exact list equality over all 173 cities).

**Prop. 4 (Cost monotonicity at fixed quality).** Fix $u$ and suppose
$q(c) = q(c')$ (in particular whenever $Q = \varnothing$, or both cities are
within the comfort zone, where $q$ is irrelevant). Then
$\gamma_c < \gamma_{c'} \Rightarrow \varphi_{\text{cost}}(c) \ge
\varphi_{\text{cost}}(c')$, with strict inequality off the lower clamp.

*Proof.* Inside the zone $\varphi = g$, strictly decreasing in $\gamma$
(slope $-0.012$). At the knee both branches equal $g(c)$ (continuity).
Beyond it, $\partial\varphi/\partial\gamma = -0.012 - 0.13(1.35-0.85q) < 0$
at fixed $q$. A piecewise-continuous function with everywhere-negative slope
is strictly decreasing; the clamp can only flatten the far tail. $\square$

The *only* sanctioned violation across differing $q$ is the dividend itself
— the specification's "tangible improvement" clause. *Tests: the
monotonicity sweep over all 173 cities at three budgets with $Q=\varnothing$,
plus the named regression "big budget must not score Zurich above Prague on
cost."*

**Prop. 5 (Per-answer stability).** One slider step ($\Delta u_k = 1$) on a
symmetric dimension moves any city's score by at most

$$|\Delta S| \le 100\,\beta\,\bar\varphi^{\beta-1}\cdot
\frac{w_k}{\sum w} \cdot \frac{1}{10}
\ \le\ 100 \cdot 2.1 \cdot 1 \cdot \frac{1.15}{12.2} \cdot 0.1 \approx 1.98.$$

No single answer tick reshuffles the world by more than ~2 points — the
model is $\tfrac{1}{10}$-Lipschitz per dimension before weighting. (The
discrete components — language branch jumps, visa tiers — are the deliberate
exceptions: capabilities *should* be able to move mountains.)

**Prop. 6 (Score locality — a lesson, not just a property).** $S(c)$ depends
only on $(c, u)$, never on other cities. An earlier release violated this at
the *display* layer: a tie-separation hack assigned
$\text{shown}_i = \min(\text{shown}_i,\ \text{shown}_{i-1} - 1)$ down the
ranked list, which at 173 cities cascaded scores through zero into negative
territory. The repair (rank by raw float, display honest rounding, allow
ties) restored locality. This is a useful cautionary example for the paper:
*presentation-layer mutations can silently break model invariants.*

---

## 5. Deterministic subsystems

The same no-randomness discipline extends to everything downstream.

**Pay bands.** $\mathrm{lo}(c, f, i) = \mathrm{round}\big(B_f \cdot (0.55 +
0.09\,\gamma_c) \cdot (0.82 + 0.12\,i)\big)$, $\mathrm{hi} = 1.28\,
\mathrm{lo}$, with field bases $B \in \{$tech 96, finance 92, health 72,
remote 70, creative 64, trades 60, edu 56, hosp 46$\}$ (k\$) and seniority
index $i \in \{0..4\}$. The COL factor spans $[0.64, 1.45]$ — labeled in-app
as *illustrative USD*, explicitly not local wage data (a documented limit:
it compresses true international wage dispersion).

**Job availability.** $\mathrm{market}(c,f) = $ *strong* if $f \in I_c \wedge
d_{c,\text{scale}} \ge 7$; *steady* if $f \in I_c$; else *thin*, in which
case the slate is 2 in-field listings plus 3 drawn from $I_c$ — availability
follows the city's economy rather than pretending every market is deep.

**Seeded generators.** All "organic" content derives from a 32-bit FNV-1a
hash of a seed string fed to a mulberry32-style mixer. Homes: 12 listings
with $\mathrm{rent}_j = \mathrm{base}_c \cdot m_{\text{type}} \cdot
U[0.88, 1.16]$ (type multipliers $\{0.72, 1.0, 1.15, 1.38, 1.85\}$), sorted
ascending. Skylines: periodic silhouettes with hills
$h(x) = b - a\,(0.7\sin(2\pi k_1 x/P + \phi_1) + 0.3\sin(2\pi k_2 x/P +
\phi_2))$, integer $k_i$ forcing exact period $P$ so a CSS translate of one
period loops seamlessly; building counts and palette lerp from
$d_{c,\text{scale}}$ and $d_{c,\text{warmth}}/10$. Audio: D-minor-pentatonic
bells (fundamental + inharmonic partial at $2.76 f$, exponential decay,
feedback delay $0.48\,$s at gain $0.32$) over a triangle-pair pad
($\pm 4$ cents) walking D–A → C–G → F–C with 7-second exponential glides and
a $0.045\,$Hz filter LFO. The music is the one non-deterministic element
(scheduling uses `Math.random`); it is ambience, not data.

---

## 6. Position in the literature

The model is a **weighted-sum MCDA / MAUT** instance with hand-designed
*marginal value functions* — but the specific shapes map onto established
ideas worth citing in a paper:

- The cost function is a **satisficing / aspiration-level** model (Simon):
  a threshold below which alternatives are equivalent-ish (the gentle slope
  keeps a strict preference for cheaper), with penalties beyond — plus a
  conditional compensator, which resembles **quality-adjusted cost** rather
  than classical cost minimization.
- One-sided penalties with no gain side echo **loss aversion** (Kahneman &
  Tversky) built directly into the value function, rather than discovered in
  behavior.
- Language and visas are **capability constraints** soft-relaxed into the
  objective — a middle road between hard feasibility filtering (which
  discards near-misses) and symmetric scoring (which lies).
- Elicitation is **compositional self-explicated conjoint**: sliders are
  direct ratings; cards are partial profiles with fixed designer-assigned
  attribute increments (cf. SMARTS / swing weighting, but without weight
  elicitation).
- As a recommender, Beacon is an extreme point of the **glass-box /
  interpretable** family: zero collaborative signal, zero embeddings, and an
  in-product explanation ("how the light works") that is the actual model,
  not a post-hoc rationalization.

The additive form assumes **preferential independence** across dimensions
(MAUT's classical requirement). Beacon partially violates it on purpose —
the safety forgiveness and cost dividend are explicit pairwise interactions
— which is itself a point of interest: both interactions are *user-selected*
rather than estimated.

---

## 7. Threats to validity and open problems

Stated as research questions rather than apologies:

1. **Weight identifiability.** $w$ is designer-set. Could it be elicited per
   user (swing weighting) or fit from choice data without sacrificing the
   glass-box property? The doubly-one-sided dimensions already gesture at
   per-user weights.
2. **Authored attributes.** Ten of twelve dimensions are single-author 0–10
   judgments with no inter-rater reliability. A study design: $n$ raters per
   city, report Krippendorff's $\alpha$, publish the disagreement.
3. **Order dependence of elicitation** (§2 remark): quantify how much the
   per-update clamp matters empirically (fraction of reachable answer
   vectors where sequence changes the profile), then fix it.
4. **Score calibration.** The percentage is an ordinal transform, not a
   probability of satisfaction. What *should* "87%" mean, and could it be
   anchored (e.g., to stated-satisfaction surveys of people who moved)?
5. **Rank-reversal sensitivity.** Classical WSM critique: perturb $w$ by
   $\pm\epsilon$ and measure Kendall-$\tau$ instability of the top-$k$;
   Sobol/variance decomposition over the full answer space would identify
   which questions actually drive outcomes (and which of the 27 could be
   dropped).
6. **External validity.** No ground truth exists for "your city." Proposed
   evaluations: convergent validity against independent rankings
   (Nomad List, Numbeo quality-of-life) on the overlapping construct;
   test–retest is trivially perfect by Prop. 1 — a feature when the
   instrument is the object of study.
7. **Data drift.** Rents, safety indices, and above all **visa rules** decay;
   the rule system is group-level by design and dated. A paper version needs
   a snapshot date and the update protocol.

---

## 8. Reproducibility

Everything in this document is runnable: `npm test` executes the 56-case
suite (including every proposition's pinning test) with zero dependencies on
Node ≥ 20; `node build.js` reproduces the shipped bundle byte-for-byte from
source; the scoring module is importable standalone
(`import { buildUser, rankAll } from './src/scoring.js'`). Data snapshots
and their provenance are in `src/data.js` and the README. There is no
training step, no seed to fix, and no environment variance to report —
which is, in the end, the point.
