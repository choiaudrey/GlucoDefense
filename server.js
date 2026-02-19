console.log(
    "API Key Check:",
    process.env.GEMINI_API_KEY ? "Found" : "NOT FOUND",
);
const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require("cors");
const path = require("path");
const app = express();
app.use(express.json());
app.use(cors());
// Serve static files from the current directory
app.use(express.static(__dirname));
// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─────────────────────────────────────────────
// LEVEL-SPECIFIC CLINICAL CONTEXT
// Grounded in: ADA/EASD 2022 Consensus Report
// "Management of Hyperglycemia in Type 2 Diabetes, 2022"
// Davies MJ, Aroda VR, Collins BS, et al.
// Diabetes Care 2022;45(11):2753–2786
// https://doi.org/10.2337/dci22-0034
// ─────────────────────────────────────────────
const LEVEL_CONTEXT = {
    1: {
        title: "Glycemic Basics — New-Onset T2DM",
        guidelineKey: `ADA/EASD 2022 Consensus Report (Davies et al., Diabetes Care 2022;45:2753-2786):
        Metformin remains the preferred first-line agent for most people with T2DM based on its high glucose-lowering efficacy, minimal hypoglycemia risk when used as monotherapy, weight neutrality with potential for modest weight loss, good safety profile, and low cost (Section: "Other Glucose-Lowering Medications — Metformin").
        Insulin therapy lowers glucose in a dose-dependent manner and can address almost any level of blood glucose, but carries significant hypoglycemia risk. Its efficacy and safety are largely dependent on education and support (Section: "Insulin").
        Sulfonylureas have high glucose-lowering efficacy but carry increased risk of hypoglycemia due to glucose-independent stimulation of insulin secretion (Section: "Sulfonylureas").
        Target: HbA1c < 7% (<53 mmol/mol) for many adults. Time in range >70% if using CGM (Consensus Report, Section: "Glycemic Assessment").`,
        optimalPath:
            "Start Metformin first (safe, effective, low cost). Add Insulin only if HbA1c remains uncontrolled. Never leave a patient on Insulin alone when Metformin is safe — unnecessary hypo risk.",
        commonErrors: [
            "Starting Insulin first instead of Metformin (skipping first-line therapy per ADA/EASD 2022)",
            "Running both simultaneously from the start (unnecessary hypo risk for a new diagnosis)",
            "Not toggling off Insulin once HbA1c is approaching target (over-treatment / failure to de-intensify)",
        ],
    },
    2: {
        title: "The Kidney Gate — T2DM + CKD",
        guidelineKey: `ADA/EASD 2022 Consensus Report (Davies et al., Diabetes Care 2022;45:2753-2786):
        For people with T2DM and CKD (eGFR <60 mL/min/1.73m2 or UACR >30 mg/g): SGLT2i with proven kidney benefit should be initiated for organ protection, independent of background glucose-lowering therapy, current HbA1c, or HbA1c target (Section: "People With Cardiorenal Comorbidities"; Figure 3).
        SGLT2i can be started if eGFR >= 20 mL/min/1.73m2. Glucose-lowering efficacy is reduced with eGFR <45, but kidney protection continues (Figure 3, CKD pathway).
        SGLT2i causes an expected initial hemodynamic eGFR dip — this is NOT a reason to stop therapy. Long-term kidney outcomes are improved (CREDENCE, DAPA-CKD trials cited in report).
        If SGLT2i is not tolerated or contraindicated, GLP-1 RA with proven CV benefit should be considered as an alternative for kidney protection.
        Metformin: Should not be used if eGFR <30 mL/min/1.73m2. Dose reduction when eGFR <45 mL/min/1.73m2 (Section: "Metformin").`,
        optimalPath:
            "Start Metformin + SGLT2i early. The SGLT2i's initial eGFR dip is expected and protective long-term. If eGFR drops below 30, stop Metformin immediately — contraindicated (lactic acidosis risk). Keep SGLT2i for kidney protection even when glucose-lowering effect diminishes.",
        commonErrors: [
            "Never activating SGLT2i (missing kidney protection — the central recommendation of ADA/EASD 2022 for T2DM + CKD)",
            "Panicking at the SGLT2i hemodynamic dip and removing it (the dip is expected and not harmful)",
            "Keeping Metformin active after eGFR drops below 30 (contraindicated per ADA/EASD 2022)",
            "Using Insulin as primary therapy when SGLT2i provides both glucose and kidney benefit",
        ],
    },
    3: {
        title: "Full Pharmacy — Contraindication Traps",
        guidelineKey: `ADA/EASD 2022 Consensus Report (Davies et al., Diabetes Care 2022;45:2753-2786):
        Metformin: First-line for most adults. Stop at eGFR <30; reduce dose at eGFR <45 (Section: "Metformin").
        SGLT2i: Initiate if eGFR >= 20. Glucose-lowering effect drops at eGFR <45, but kidney and CV protection continue. Key agents: empagliflozin, canagliflozin, dapagliflozin (Section: "SGLT2 Inhibitors").
        GLP-1 RA: High glucose-lowering efficacy with low hypoglycemia risk. Promotes weight loss via satiety. GI side effects (nausea) are common, especially during initiation. Slower dose escalation can mitigate GI intolerance (Section: "GLP-1 Receptor Agonists").
        DPP-4i: Modest glucose-lowering efficacy, weight-neutral, well tolerated, minimal hypoglycemia risk. However, DPP-4i should NOT be combined with GLP-1 RA — both act on the incretin pathway and combination provides no additive benefit (Table 1, Section: "DPP-4 Inhibitors").
        Sulfonylurea: High glucose-lowering efficacy but increased hypoglycemia risk due to glucose-independent insulin secretion. Inexpensive and accessible. Risk amplified when combined with Insulin (Section: "Sulfonylureas").
        Insulin: Strongest glucose-lowering in a dose-dependent manner. Highest hypoglycemia risk. Risk doubled with concurrent Sulfonylurea (Section: "Insulin").
        Key interaction traps: GLP-1 RA + DPP-4i = redundant (same incretin pathway). SU + Insulin = amplified hypo. Metformin at eGFR <30 = lactic acidosis risk.`,
        optimalPath:
            "Metformin + SGLT2i as foundation. Add GLP-1 RA for additional HbA1c reduction and CV/kidney benefit. Avoid DPP-4i if GLP-1 RA is active (redundant incretin pathway). Use Insulin as last resort. Never combine SU + Insulin. Monitor eGFR and adjust accordingly.",
        commonErrors: [
            "Activating GLP-1 RA + DPP-4i simultaneously (redundant incretin pathway — ADA/EASD 2022 Table 1)",
            "Combining Sulfonylurea + Insulin (doubled hypo risk)",
            "Keeping Metformin after eGFR < 30",
            "Ignoring SGLT2i for kidney protection in a patient with CKD",
            "Activating too many drugs at once (polypharmacy reduces adherence — ADA/EASD 2022, Section: 'Treatment Behaviors, Persistence, and Adherence')",
        ],
    },
    4: {
        title: "The Real Patient — Social Determinants of Health",
        guidelineKey: `ADA/EASD 2022 Consensus Report (Davies et al., Diabetes Care 2022;45:2753-2786):
        This level integrates social determinants of health (SDOH) into prescribing decisions, as emphasized in the holistic person-centered approach (Figure 4).
        The Consensus Report states: "The person living with type 2 diabetes should be at the center of care" and highlights that SDOH — including psychosocial factors, language barriers, and access to care — must be considered in management (Section: "Putting It All Together: Strategies for Implementation"; Figure 4).
        Suboptimal medication-taking behavior affects almost half of people with T2DM, leading to increased complications, mortality, and health care costs. Multiple factors contribute: perceived lack of efficacy, fear of hypoglycemia, lack of access, adverse effects, and cost (Section: "Treatment Behaviors, Persistence, and Adherence").
        Cost is a major driver: SGLT2i and GLP-1 RA are clinically ideal but expensive. The report acknowledges that "in the setting of resource constraints, prioritization of the highest risk groups for access to these agents may be needed" (Section: "People With Cardiorenal Comorbidities").
        Sulfonylureas are cheap and accessible but carry hypoglycemia risk — which is amplified by food insecurity (irregular meals).
        Patient context: Recent immigrant, no drug coverage, food insecurity, limited English.
        GLP-1 RA is clinically ideal but DENIED by insurance (cost barrier — a real-world constraint the Consensus Report explicitly acknowledges).
        Adherence degrades with polypharmacy (>2 drugs). Below 30% adherence, efficacy collapses.
        Metformin + SGLT2i is the most realistic regimen: affordable (metformin is low-cost; SGLT2i may require advocacy for coverage), effective, low pill burden, no hypo risk.`,
        optimalPath:
            "Metformin + SGLT2i (2-drug regimen for adherence). Avoid SU due to food insecurity hypo risk. Accept that GLP-1 RA is unavailable. Keep drug count <= 2 to maintain adherence. Stabilize for 25 seconds.",
        commonErrors: [
            "Attempting GLP-1 RA despite insurance denial (not reading the constraint)",
            "Using Sulfonylurea without considering food insecurity (3x hypo risk with irregular meals)",
            "Polypharmacy (> 2 drugs) tanking adherence below 30%",
            "Ignoring adherence as a clinical outcome (ADA/EASD 2022 dedicates a full section to this)",
            "Treating this like a pharmacology problem instead of a systems problem (missing the holistic person-centered approach of Figure 4)",
        ],
    },
};

// ─────────────────────────────────────────────
// BUILD THE DEBRIEF PROMPT
// ─────────────────────────────────────────────
function buildDebriefPrompt(sessionData) {
    const level = sessionData.level || 1;
    const ctx = LEVEL_CONTEXT[level] || LEVEL_CONTEXT[1];
    const win = sessionData.win;
    const outcome = sessionData.outcome;
    const finalStats = sessionData.finalStats || {};
    const startingStats = sessionData.startingStats || {};
    const activeDrugsAtEnd = sessionData.activeDrugsAtEnd || [];
    const decisionLog = sessionData.decisionHistory || [];
    const adherence = sessionData.adherence;
    const patient = sessionData.patientProfile || {};

    // Compute timeline summary from decision log
    const drugTimeline = decisionLog
        .map(
            (d, i) =>
                `  ${i + 1}. Drug: ${d.drug} | HbA1c: ${d.HbA1c_at_time}% | eGFR: ${d.eGFR_at_time} | HypoRisk: ${d.hypoRisk_at_time || "N/A"}${d.adherence_at_time !== undefined ? ` | Adherence: ${d.adherence_at_time}%` : ""}`,
        )
        .join("\n");

    const prompt = `
You are a clinical preceptor debriefing a medical student after a Type 2 Diabetes management simulation game. Your role is to be a Socratic coach — not a quiz grader. You help the learner REFLECT on their decisions and build clinical reasoning schemas.

=== LEVEL: ${level} — ${ctx.title} ===

=== PATIENT PROFILE ===
Name: ${patient.name || "Unknown"}
History: ${patient.history || "T2DM"}
Starting HbA1c: ${startingStats.HbA1c || "?"}%
Starting eGFR: ${startingStats.eGFR || "?"}
${level === 4 ? "Special Context: Recent immigrant. No drug coverage. Food insecurity. Limited English." : ""}

=== OUTCOME ===
Result: ${win ? "PATIENT STABILIZED (Win)" : `PATIENT LOST — ${outcome}`}
Final HbA1c: ${finalStats.HbA1c}%
Final eGFR: ${finalStats.eGFR}
Final Hypo Risk: ${finalStats.hypoRisk}%
${adherence !== undefined ? `Final Adherence: ${adherence}%` : ""}
Active drugs at end: [${activeDrugsAtEnd.join(", ")}]

=== PLAYER DECISION LOG (chronological) ===
${drugTimeline || "  (No drugs were activated)"}

=== GUIDELINE REFERENCE ===
Source: ADA/EASD 2022 Consensus Report — "Management of Hyperglycemia in Type 2 Diabetes, 2022"
(Davies MJ, Aroda VR, Collins BS, et al. Diabetes Care 2022;45:2753-2786. DOI: 10.2337/dci22-0034)

${ctx.guidelineKey}

=== OPTIMAL PATH FOR THIS LEVEL ===
${ctx.optimalPath}

=== COMMON ERRORS TO CHECK FOR ===
${ctx.commonErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}

=== YOUR TASK ===
Write a clinical debrief that does ALL of the following:

${
    win
        ? `
1. ACKNOWLEDGE THE WIN genuinely. The patient was stabilized. Start with what the student did RIGHT and specifically name the drugs/timing that worked.
2. GUIDELINE ALIGNMENT: Briefly note how their approach aligns (or partially misaligns) with the ADA/EASD 2022 Consensus Report. Be specific — reference the relevant section or figure from the Consensus Report (e.g., "Figure 3 recommends...", "The Consensus Report's section on SGLT2i states...").
3. OPTIMIZATION OPPORTUNITY: Even on a win, identify ONE thing they could improve next time (e.g., faster SGLT2i initiation, unnecessary drug that added risk). Frame this constructively.
4. SOCRATIC REFLECTION: Ask 2 targeted "why" questions that force the learner to articulate the clinical reasoning behind their successful choices. These should test whether they UNDERSTOOD why it worked, not just that it worked.
   Example: "You activated SGLT2i early — can you explain WHY the initial eGFR dip is expected and not dangerous?"
`
        : `
1. CLINICAL SUMMARY: State what happened to the patient in 1 sentence. Do NOT call it a "fatal flaw" — call it a "critical decision point."
2. THE KEY DECISION: Identify the SPECIFIC drug-stat interaction that caused the loss. Reference the exact eGFR or HbA1c values from the decision log where things went wrong.
3. GUIDELINE CORRECTION: Explain what the ADA/EASD 2022 Consensus Report recommends instead. Be specific — reference the section, figure, or table (e.g., "Figure 3's CKD pathway recommends...", "Table 1 notes that DPP-4i...").
4. THE BETTER PATH: In 1-2 sentences, describe what the student should try differently.
5. SOCRATIC REFLECTION: Ask 2 targeted "why" questions that force the learner to think about the mechanism, not just memorize the rule.
   Example: "WHY does Metformin become dangerous below eGFR 30? What accumulates?"
`
}

=== FORMAT RULES ===
- Plain text only. No markdown, no **, no ##, no bullet symbols.
- Use line breaks between sections.
- Keep total response under 200 words.
- ${win ? "Tone: Warm, encouraging, collegial. Like a preceptor who is proud but still teaching." : "Tone: Supportive but direct. Like a preceptor who wants the student to succeed next time."}
- NEVER say "fatal flaw" on a win.
- ALWAYS reference specific drug names and stat values from the session data.
- When citing guidelines, always reference "ADA/EASD 2022 Consensus Report".
- End with the 2 Socratic questions, clearly labeled "REFLECTION QUESTIONS:"
`;

    return prompt;
}

app.post("/api/debrief", async (req, res) => {
    try {
        const sessionData = req.body;
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = buildDebriefPrompt(sessionData);

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const aiText = response.text();

        res.json({ text: aiText || "Consultation complete." });
    } catch (error) {
        console.error("FULL ERROR LOG:", JSON.stringify(error, null, 2));
        console.error("Error Message:", error.message);
        res.status(500).json({ text: `Gemini says: ${error.message}` });
    }
});

// Serve index.html for the root route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
    res.status(200).sendFile(__dirname + "/index.html");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
    console.log(`Server running on port ${PORT}`),
);
