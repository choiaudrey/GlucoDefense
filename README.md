## Links
Game: [https://gluco-defense--choiaudreyy.replit.app/](URL)

Devpost: [https://devpost.com/software/glucodefense#updates](URL)

## Inspiration
Question banks teach you *what* to prescribe. They don't teach you *when*, or what happens when you're wrong. In real clinical practice, a prescribing decision unfolds over time: you start a drug, watch the patient's labs shift, and adjust. You manage trade-offs between efficacy and safety simultaneously. No existing tool (UWorld, AMBOSS, Anki, or ChatGPT wrappers) replicates this temporal, consequential decision-making.

We wanted to build something that forces you to *prescribe under pressure* and then *reflect on why it worked or didn't*, instead of just recalling a fact from a flashcard.

## What it does
GlucoDefense is a real-time clinical simulation game for T2DM medication management, built on the ADA/EASD 2022 Consensus Report. Players manage a live patient across 4 escalating clinical levels:

- **Level 1 Glycemic Basics:** New-onset T2DM. Learn Metformin-first principles and hypoglycemia risk.
- **Level 2 The Kidney Gate:** T2DM + CKD. Manage eGFR decline and learn SGLT2i kidney protection.
- **Level 3 Full Pharmacy:** Six drug classes with contraindication traps (GLP-1 RA + DPP-4i redundancy, SU + Insulin amplified hypo).
- **Level 4 The Real Patient:** Social determinants of health such as insurance denial, food insecurity, adherence collapse from polypharmacy.

After every case (win or loss), an **AI clinical preceptor** (powered by Gemini) analyzes the player's exact decision log and delivers a personalized Socratic debrief, referencing specific ADA/EASD 2022 guideline sections and the player's own drug-timing data.

### How Learning Theory Shaped the Architecture
This is not a game with theory bolted on afterward. The level structure *is* the theory:

**Cognitive Load Theory** drives the progressive level design. Level 1 isolates one variable (HbA1c vs. hypo risk). Level 2 adds kidney function. Level 3 introduces drug interactions. Level 4 adds social constraints. Each level adds complexity so the learner builds one schema before layering the next, hence reducing extraneous cognitive load.

**Deliberate Practice** is embedded in the core loop. Every drug toggle is a decision with immediate, visible consequences (HbA1c shifts, eGFR drops, hypo spikes). The feedback is not delayed to the end of a quiz, but instead continuous and real-time, matching the conditions under which expertise develops.

**Elaborative Interrogation** powers the AI debrief. The Gemini-based preceptor doesn't just grade performance (as normal quiz apps do), it asks targeted Socratic questions that force the learner to articulate *why* their choices worked or failed. For example: "You activated SGLT2i early. Can you explain WHY the initial eGFR dip is expected and not dangerous?" This moves learning from recall to reasoning.

## How we built it
The game engine is **Phaser 3** (JavaScript) running in-browser. The backend is **Node.js/Express** serving a **Gemini 2.5 Flash** API endpoint for AI debriefs. Each level has clinically accurate drug mechanics coded from the ADA/EASD 2022 Consensus Report: real eGFR thresholds, actual contraindication logic, guideline-accurate drug interactions, and SDOH constraints drawn from the report's section on implementation and health equity (Figure 4).

The AI debrief prompt is heavily engineered. It receives the player's full decision log (drug name, timestamp, HbA1c/eGFR/hypo risk at time of decision) and compares it against level-specific optimal paths and common errors, all grounded in specific sections of the ADA/EASD 2022 Consensus Report. The prompt enforces plain-text output, Socratic questioning, and guideline citation.

## Challenges we ran into
- Balancing game difficulty so that the "correct" clinical path (per ADA/EASD 2022) is also the winning strategy
- Engineering the AI prompt to be Socratic rather than evaluative (preceptor, not grader)
- Making SDOH constraints in Level 4 feel like real clinical barriers, not arbitrary game rules
- Compressing longitudinal diabetes management into a real-time simulation without losing clinical fidelity

## What we learned
As it turns out, the hardest design problem wasn't technical. It is how to *tune the simulation to be clinically honest while remaining playable*. Real T2DM management unfolds over months; our simulation compresses it to minutes. Balancing that compression while keeping drug interactions, eGFR decay rates, and hypo mechanics proportionally accurate required constant iteration.

We also learned that Level 4 (social determinants) is the most powerful teaching moment. Players who breeze through Levels 1–3 on pharmacology knowledge alone often fail Level 4 because they treat it like a drug problem instead of a systems problem. That moment of failure, and the AI debrief that follows, is where the deepest learning happens.

## What's next for GlucoDefense
- More vitals/physiological consideration: Cardiovascular (atherosclerosis, MI risk), Neuropathic pain, Obesity/insulin resistance
- Additional levels & patient cases: transportation barriers, cultural dietary considerations, interpreter access
- Multiplayer mode: collaborative prescribing with disagreement-based learning
- Formal evaluation: pre/post RCT comparing GlucoDefense to question-bank learning on medication selection accuracy
- Integration with medical school pharmacology curricula as a supplementary tool
