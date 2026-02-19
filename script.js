import { requestAIDebrief } from "./ai.js";

const DRUGS = {
    MET:   { name: "METFORMIN",      label: "METFORMIN",             color: 0x4CAF50, efficacy: 0.15, hypoChance: 0 },
    INS:   { name: "INSULIN",       label: "INSULIN\n(Fast/Risky)", color: 0xF44336, efficacy: 0.30, hypoChance: 0.01 },
    SGLT2: { name: "SGLT2-i",       label: "SGLT2-i\n(Shield)",     color: 0x2196F3, efficacy: 0.06, hypoChance: 0 },
    GLP1:  { name: "GLP-1 RA",      label: "GLP-1 RA\n(Strong)",    color: 0x9C27B0, efficacy: 0.20, hypoChance: 0 },
    SU:    { name: "SULFONYLUREA",  label: "SULFONYLUREA\n(Cheap)", color: 0xFF9800, efficacy: 0.12, hypoChance: 0.005 },
    DPP4:  { name: "DPP-4i",        label: "DPP-4i\n(Weak/Safe)",   color: 0x607D8B, efficacy: 0.05, hypoChance: 0 },
};

const LEVEL_DRUGS = { 
    1: ["MET", "INS"], 
    2: ["MET", "SGLT2", "INS"], 
    3: ["MET", "INS", "SGLT2", "GLP1", "SU", "DPP4"], 
    4: ["MET", "INS", "SGLT2", "GLP1", "SU", "DPP4"] 
};

class GameScene extends Phaser.Scene {
    constructor() {
        super("GameScene");
    }

    init(data) {
        this.level = data.level || 0;
        this.isPaused = false;

        // Level-specific starting stats
        const levelStats = {
            1: { hba1c: 8.5, egfr: 90 },
            2: { hba1c: 8.5, egfr: 90 },
            3: { hba1c: 9.0, egfr: 65 },
            4: { hba1c: 9.2, egfr: 55 }
        };

        const stats = levelStats[this.level] || { hba1c: 8.5, egfr: 90 };
        
        this.patient = {
            HbA1c: stats.hba1c,
            eGFR: stats.egfr,
            hypoRisk: 0,
            weight: 75,
            activeDrugs: new Set(),
            stableTime: 0,
        };

        this.drugToggles = [];  // Tracks every toggle on/off with timestamp and stats
        this.gameStartTime = 0; // Will be set in create()
        
    }

    create() {
        this.cameras.main.setBackgroundColor("#000000");
        this.gameOver = false;
        if (this.level === 0) return this.createMenu();

        this.enemies = this.physics.add.group();
        this.setupUI();
        this.setupPharmacy();
        this.createPauseButton();

        this.gameStartTime = this.time.now;
        
        // Sugar Spawning: Level 3 spawns every 3s, all others every 4s
        this.time.addEvent({
            delay: this.level === 3 ? 3000 : 4000,
            callback: this.spawnGlucose,
            callbackScope: this,
            loop: true,
        });
        
        
        // CKD Spawning: Now triggers for Level 2, 3, and 4
        this.decisionLog = [];

        if (this.level >= 2) {
            this.time.addEvent({
                delay: 7500,
                callback: this.spawnCKD,
                callbackScope: this,
                loop: true,
            });
        }
        
        // Pause game and show patient case card for ALL levels
        this.physics.pause();
        this.isPaused = true;

        if (this.level === 1) {
            // Level 1: case card → then tutorial → then game starts
            this.showBriefing(this.level, () => this.showTutorial());
        } else {
            // Levels 2-4: case card → then game starts
            this.showBriefing(this.level, () => {
                this.isPaused = false;
                this.physics.resume();
            });
        }
    }

    // Create a function to log every time a player places a drug "tower"
    
    logDecision(drugKey, action) {
        const elapsed = ((this.time.now - this.gameStartTime) / 1000).toFixed(1);
        this.decisionLog.push({
            time_seconds: parseFloat(elapsed),
            drug: DRUGS[drugKey]?.name || drugKey,
            drugKey: drugKey,
            action: action,  // "ON" or "OFF"
            HbA1c_at_time: parseFloat(this.patient.HbA1c.toFixed(1)),
            eGFR_at_time: Math.round(this.patient.eGFR),
            hypoRisk_at_time: Math.round(this.patient.hypoRisk),
            activeDrugs: [...this.patient.activeDrugs],
            ...(this.level === 4 && { adherence_at_time: Math.round(this.patient.adherence || 100) })
        });
    }
    

    showBriefing(levelId, onClose) {
        const cases = {
            1: "PATIENT: Mrs. Chen, 52\nNew T2DM diagnosis\nHbA1c: 8.5% | No complications\n\nGOAL: Maintain HbA1c below 7.0%",
            2: "PATIENT: Mr. Williams, 64\nT2DM + Stage 3a CKD\nHbA1c: 8.5%, eGFR: 90 (declining)\n\nGOAL: Control glucose AND protect kidneys",
            3: "PATIENT: Mrs. Okonkwo, 58\nT2DM + CKD + Obesity\nHbA1c: 9.0%, eGFR: 65, BMI: 36\nFull pharmacy available — some combos are dangerous\n\nGOAL: Balance efficacy, safety, and kidney protection",
            4: "PATIENT: Mr. Ahmed, 61\nRecent immigrant, Scarborough\nT2DM, HbA1c: 9.2%, eGFR: 55, BMI: 34\nNo drug coverage. Food insecurity. Limited English.\n\nGOAL: Stabilize with real-world constraints",
        };

        let content = cases[levelId] || "";

        let bg = this.add
            .rectangle(400, 300, 800, 600, 0x000000, 0.9)
            .setInteractive()
            .setDepth(100);
        let box = this.add.rectangle(400, 300, 500, 320, 0x333333).setDepth(100);
        let title = this.add
            .text(400, 170, "PATIENT CASE FILE", {
                fontSize: "24px",
                color: "#0f0",
                fontWeight: "bold",
            })
            .setOrigin(0.5)
            .setDepth(100);
        let txt = this.add
            .text(400, 300, content, {
                fontSize: "16px",
                color: "#fff",
                align: "center",
                wordWrap: { width: 450 },
                lineSpacing: 6,
            })
            .setOrigin(0.5)
            .setDepth(100);
        let btnBg = this.add
            .rectangle(400, 430, 220, 50, 0x00ff00)
            .setInteractive({ useHandCursor: true })
            .setDepth(100);
        let btnText = this.add
            .text(400, 430, "BEGIN TREATMENT", {
                fontSize: "16px",
                color: "#000",
                fontWeight: "bold",
            })
            .setOrigin(0.5)
            .setDepth(100);

        btnBg.on("pointerdown", () => {
            bg.destroy();
            box.destroy();
            title.destroy();
            txt.destroy();
            btnBg.destroy();
            btnText.destroy();
            if (onClose) onClose();
        });
    }
       

    showTutorial() {
        // Pause game logic so player isn't attacked during the tutorial
        this.physics.pause();
        this.isPaused = true;

        const overlay = this.add.container(0, 0).setDepth(100);

        // 1. Dark Backdrop
        let bg = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.85).setInteractive();

        // 2. Tutorial Box
        let box = this.add.rectangle(400, 300, 600, 450, 0x222222).setStrokeStyle(2, 0x00ff00);

        let title = this.add.text(400, 120, "SYSTEM ORIENTATION", {
            fontSize: "28px", color: "#0f0", fontWeight: "bold"
        }).setOrigin(0.5);

        // 3. The Instruction List
        const tutorialText = 
            "1. HbA1c BAR: Your primary metric. Keep it below 7.0%.\n\n" +
            "2. HYPOGLYCEMIA RISK: Avoid reaching 100% or the patient enters a coma.\n\n" +
            "3. DRUG PANEL: Click grey buttons at the bottom to toggle drug treatment ON/OFF.\n\n" +
            "4. SUGAR ENEMIES: Yellow 'SUGAR' icons raise HbA1c when it reaches the patient.\n\n" +
            "5. WIN CONDITION: Maintain stable HbA1c < 7.0% for 20 SECONDS.";

        let content = this.add.text(400, 290, tutorialText, {
            fontSize: "16px", color: "#fff", wordWrap: { width: 500 }, lineSpacing: 8
        }).setOrigin(0.5);

        // 4. 'GOT IT' Button
        let btnBg = this.add.rectangle(400, 470, 180, 50, 0x00ff00).setInteractive({ useHandCursor: true });
        let btnText = this.add.text(400, 470, "GOT IT", { color: "#000", fontWeight: "bold" }).setOrigin(0.5);

        overlay.add([bg, box, title, content, btnBg, btnText]);

        // 5. Dismissal Logic
        btnBg.on("pointerdown", () => {
            this.physics.resume();
            this.isPaused = false;
            overlay.destroy();
        });
    }


    showDrugReference() {
        this.isPaused = true;
        const overlay = this.add.container(0, 0).setDepth(200);
        let bg = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.9).setInteractive();
        let box = this.add.rectangle(400, 300, 700, 500, 0x222222).setStrokeStyle(2, 0x00ff00);

        // Page state
        let page = 1;

        const page1Text = 
            "DRUG QUICK REFERENCE\n\n" +
            "METFORMIN — Safe, steady HbA1c reduction. No hypo risk.\n\n" +
            "INSULIN — Strongest HbA1c reduction. High hypo risk.\n\n" +
            "SGLT2-i — Mild HbA1c reduction. Shields kidneys from CKD.\n\n" +
            "GLP-1 RA — Strong HbA1c reduction. May cause GI distress.\n\n" +
            "SULFONYLUREA — Moderate reduction. Cheap but causes hypo.\n\n" +
            "DPP-4i — Weakest reduction. Safe. No hypo risk.";

        const page2Text = 
            "CONTRAINDICATIONS & INTERACTIONS\n\n" +
            "METFORMIN: Contraindicated if eGFR < 30 (lactic acidosis).\n\n" +
            "SGLT2-i: Causes initial eGFR dip. Glucose effect drops at\n" +
            "eGFR < 45, but kidney protection continues if eGFR > 20.\n\n" +
            "GLP-1 RA + DPP-4i: Redundant! Same pathway. No added benefit.\n\n" +
            "SULFONYLUREA + INSULIN: Doubled hypoglycemia risk.\n\n" +
            "DPP-4i: Efficacy halved when eGFR < 45.\n\n" +
            "GLP-1 RA: Random GI side effects reduce all drug efficacy.";

        let title = this.add.text(400, 80, "PHARMACOLOGY REFERENCE", {
            fontSize: "24px", color: "#0f0", fontWeight: "bold"
        }).setOrigin(0.5);

        let content = this.add.text(400, 300, page1Text, {
            fontSize: "15px", color: "#fff", wordWrap: { width: 620 }, lineSpacing: 4, align: "left"
        }).setOrigin(0.5);

        let pageLabel = this.add.text(400, 520, "Page 1/2", {
            fontSize: "14px", color: "#888"
        }).setOrigin(0.5);

        let nextBtn = this.add.rectangle(550, 520, 120, 35, 0x444444).setInteractive({ useHandCursor: true });
        let nextTxt = this.add.text(550, 520, "NEXT →", { fontSize: "14px", fontWeight: "bold" }).setOrigin(0.5);

        let closeBtn = this.add.rectangle(250, 520, 120, 35, 0x00ff00).setInteractive({ useHandCursor: true });
        let closeTxt = this.add.text(250, 520, "CLOSE", { fontSize: "14px", color: "#000", fontWeight: "bold" }).setOrigin(0.5);

        overlay.add([bg, box, title, content, pageLabel, nextBtn, nextTxt, closeBtn, closeTxt]);

        nextBtn.on("pointerdown", () => {
            page = page === 1 ? 2 : 1;
            content.setText(page === 1 ? page1Text : page2Text);
            pageLabel.setText(`Page ${page}/2`);
            nextTxt.setText(page === 1 ? "NEXT →" : "← BACK");
        });

        closeBtn.on("pointerdown", () => {
            overlay.destroy();
            this.isPaused = false;
        });
    }
    
    
    createMenu() {
        this.add
            .text(400, 80, "GLOCO DEFENSE", {
                fontSize: "40px",
                color: "#0f0",
                fontWeight: "bold",
            })
            .setOrigin(0.5);

        // Drug Reference Button
        let refBtn = this.add.rectangle(400, 185, 200, 35, 0x444444)
            .setInteractive({ useHandCursor: true });
        this.add.text(400, 185, "DRUG REFERENCE", {
            fontSize: "14px", color: "#0f0", fontWeight: "bold"
        }).setOrigin(0.5);
        refBtn.on("pointerdown", () => this.showDrugReference());
        refBtn.on("pointerover", () => refBtn.setFillStyle(0x555555));
        refBtn.on("pointerout", () => refBtn.setFillStyle(0x444444));

        
        this.add
                .text(400, 145, "Select a Level", {
                fontSize: "18px",
                color: "#fff",
            })
            .setOrigin(0.5);

        const levels = [
            {
                id: 1,
                name: "Level 1: Glycemic Basics",
                desc: "Manage Sugar vs Hypo Risk",
            },
            {
                id: 2,
                name: "Level 2: The Kidney Gate",
                desc: "eGFR Decay + SGLT2-i Shielding",
            },
            {
                id: 3,
                name: "Level 3: Full Pharmacy",
                desc: "All drug classes. Contraindication traps.",
            },
            {
                id: 4,
                name: "Level 4: The Real Patient",
                desc: "Social determinants. Real-world constraints.",
            },
        ];

        levels.forEach((lvl, i) => {
            // Dark Dashboard Style Buttons
            let btnY = 240 + i * 80;
            let btn = this.add
                .rectangle(400, btnY, 420, 70, 0x333333)
                .setInteractive({ useHandCursor: true });

            // The Info Icon
           
            let infoIcon = this.add
                .circle(630, btnY, 20, 0x555555)
                .setInteractive({ useHandCursor: true });

            this.add.text(630, btnY, "i", { fontSize: "20px", fontStyle: "bold" }).setOrigin(0.5);

            infoIcon.on("pointerdown", () => this.showBriefing(lvl.id, null));

            this.add.text(400, btnY - 12, lvl.name, {
                fontSize: "20px",
                color: "#0f0",
                fontWeight: "bold",
            }).setOrigin(0.5);

            this.add.text(400, btnY + 15, lvl.desc, {
                fontSize: "14px",
                color: "#aaa",
            }).setOrigin(0.5);

            btn.on("pointerdown", () => this.scene.restart({ level: lvl.id }));
            btn.on("pointerover", () => btn.setFillStyle(0x444444));
            btn.on("pointerout", () => btn.setFillStyle(0x333333));
        });
    }

    setupUI() {
        this.add.rectangle(400, 50, 800, 100, 0x000000, 0.8);
        const style = { fontSize: "20px", color: "#fff", fontWeight: "bold" };
        this.hbText = this.add.text(20, 20, "", style);
        this.hypoText = this.add.text(20, 55, "", {
            ...style,
            color: "#ffa500",
        });

        
        if (this.level >= 2) {
            this.egfrText = this.add.text(550, 20, "", {
                ...style,
                color: "#00ffff",
            });
        }
        
        this.statusText = this.add
            .text(400, 30, "UNSTABLE", { fontSize: "24px", fontWeight: "bold" })
            .setOrigin(0.5);
        
        // Patient sprite on the right side
        this.patientBody = this.add.rectangle(770, 350, 30, 50, 0x00ff88);
        this.patientHead = this.add.circle(770, 315, 15, 0x00ff88);
        this.add.text(770, 395, "PATIENT", { fontSize: "10px", color: "#888" }).setOrigin(0.5);
    }

    setupPharmacy() {
        const drugsForLevel = LEVEL_DRUGS[this.level] || [];
        const spacing = 800 / (drugsForLevel.length + 1);

        drugsForLevel.forEach((key, index) => {
            const config = DRUGS[key];
            const x = spacing * (index + 1);
            const y = 540;

            // Visual feedback for Level 4 "No Coverage"
            let label = config.label;
            let color = config.color;
            if (this.level === 4 && key === "GLP1") {
                label = "GLP-1 RA\n(NO COVERAGE)";
                color = 0x555555;
            }

            this.createBtn(x, y, key, label, color);
        });

        // Level 4 Adherence Mechanic Init
        if (this.level === 4) {
            this.patient.adherence = 100;
            this.adherenceText = this.add.text(550, 55, "ADHERENCE: 100%", { 
                fontSize: "20px", fontWeight: "bold", color: "#ffffff" 
            });
        }
    }

    createBtn(x, y, id, label, color) {
        let btn = this.add.container(x, y);
        const drugCount = (LEVEL_DRUGS[this.level] || []).length;
        const btnWidth = drugCount <= 3 ? 210 : 120;
        const fontSize = drugCount <= 3 ? "16px" : "12px";
        let rect = this.add
            .rectangle(0, 0, btnWidth, 75, 0x333333)
            .setInteractive({ useHandCursor: true });
        let txt = this.add
            .text(0, 0, label, {
                align: "center",
                fontSize: fontSize,
                fontWeight: "bold",
            })
            .setOrigin(0.5);
        
        btn.add([rect, txt]);
        rect.on("pointerdown", () => this.toggleDrug(id, rect, color));
    }
    

    toggleDrug(id, rect, color) {
        if (this.patient.activeDrugs.has(id)) {
            this.patient.activeDrugs.delete(id);
            rect.setFillStyle(0x333333);
            this.logDecision(id, "OFF");  // <── NEW: log the OFF action
        } else {
            // Level 4 Constraint: No Coverage
            if (this.level === 4 && id === "GLP1") {
                return this.flashMsg("INSURANCE DENIED ($$$)", "#ff4444");
            }
            // Clinical Contraindication: Metformin
            if (id === "MET" && this.patient.eGFR < 30) {
                return this.flashMsg("CONTRAINDICATED (eGFR < 30)", "#f00");
            }
            // SGLT2 Initiation Dip
            if (id === "SGLT2") {
                this.patient.eGFR -= 3;
                this.flashMsg("HEMODYNAMIC DIP (-3 eGFR)", "#00ffff");
            }
            // Level 4 Food Insecurity Warning
            if (this.level === 4 && id === "SU") {
                this.flashMsg("⚠ FOOD INSECURITY: HYPO RISK 3x", "#ffa500");
            }
            // Interaction warnings
            if ((id === "DPP4" && this.patient.activeDrugs.has("GLP1")) || (id === "GLP1" && this.patient.activeDrugs.has("DPP4"))) {
                this.flashMsg("REDUNDANT — No added benefit!", "#888");
            }
            if ((id === "SU" && this.patient.activeDrugs.has("INS")) || (id === "INS" && this.patient.activeDrugs.has("SU"))) {
                this.flashMsg("⚠ AMPLIFIED HYPO RISK", "#ff4444");
            }
            this.patient.activeDrugs.add(id);
            rect.setFillStyle(color);
            this.logDecision(id, "ON");  // <── CHANGED: now passes "ON"
        }
    }

    createPauseButton() {
        let pBtn = this.add
            .rectangle(750, 30, 80, 40, 0x555555)
            .setInteractive({ useHandCursor: true });
        this.add
            .text(750, 30, "PAUSE", { fontSize: "14px", fontWeight: "bold" })
            .setOrigin(0.5);
        pBtn.on("pointerdown", () => this.showPauseMenu());
    }

    showPauseMenu() {
        this.isPaused = true;
        this.physics.pause();
        this.pauseOverlay = this.add.container(0, 0);
        let bg = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.7);
        let box = this.add.rectangle(400, 300, 300, 250, 0x333333);

        let res = this.add
            .text(400, 240, "RESUME", { fontSize: "24px", color: "#fff" })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });
        let rst = this.add
            .text(400, 300, "RESTART", { fontSize: "24px", color: "#ff0" })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });
        let mnu = this.add
            .text(400, 360, "MAIN MENU", { fontSize: "24px", color: "#ff4444" })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        this.pauseOverlay.add([bg, box, rst, res, mnu]);

        rst.on("pointerdown", () => this.scene.restart({ level: this.level }));
        res.on("pointerdown", () => {
            this.isPaused = false;
            this.physics.resume();
            this.pauseOverlay.destroy();
        });
        mnu.on("pointerdown", () => this.scene.restart({ level: 0 }));
    }

    spawnGlucose() {
        if (this.gameOver || this.isPaused) return;
        const e = this.add.circle(-20, 200 + Math.random() * 200, 20, 0xffff00);
        this.physics.add.existing(e);
        this.enemies.add(e);
        e.body.setVelocityX(100);
        e.label = this.add
            .text(e.x, e.y, "SUGAR", {
                fontSize: "12px",
                color: "#000",
                fontWeight: "bold",
            })
            .setOrigin(0.5);
    }

    spawnCKD() {
        if (this.gameOver || this.isPaused) return;
        const e = this.add.circle(-20, 300, 20, 0x800080);
        this.physics.add.existing(e);
        this.enemies.add(e);
        e.body.setVelocityX(80);
        e.isCkd = true;
        e.label = this.add
            .text(e.x, e.y, "CKD", { fontSize: "12px", fontWeight: "bold" })
            .setOrigin(0.5);
    }

    update(time, delta) {
        if (this.gameOver || this.level === 0 || this.isPaused) return;
        const dt = delta / 1000;
        const oldHb = this.patient.HbA1c;
        const oldEgfr = this.patient.eGFR;

        // 1. Natural Drift
        this.patient.HbA1c += 0.04 * dt;
        
        if (this.level >= 2) {
            let decay = this.patient.HbA1c > 7.5 ? 0.08 : 0;
            
            if (this.patient.activeDrugs.has("SGLT2")) decay *= 0.15;
            if (
                this.patient.HbA1c < 7.0 &&
                this.patient.activeDrugs.has("SGLT2")
            )
                decay = 0;
            this.patient.eGFR -= decay;
        }

        // --- 2. Drug Effects & Interactions ---
        let totalEfficacyModifier = 1.0;

        // Level 4 Adherence Logic
        if (this.level === 4) {
            const drugCount = this.patient.activeDrugs.size;
            this.patient.adherence += (drugCount > 2 ? -5 : 3) * dt;
            this.patient.adherence = Phaser.Math.Clamp(this.patient.adherence, 0, 100);
            this.adherenceText.setText(`ADHERENCE: ${Math.round(this.patient.adherence)}%`);

            if (this.patient.adherence < 30) totalEfficacyModifier = 0.2;
            else if (this.patient.adherence < 60) totalEfficacyModifier = 0.5;
            this.adherenceText.setColor(this.patient.adherence < 60 ? "#ff0000" : "#ffffff");
        }

        // GLP-1 / GI Side Effect Chance (5% every 10s -> ~0.5% per sec)
        if (this.patient.activeDrugs.has("GLP1") && Math.random() < 0.005) {
            this.flashMsg("GI DISTRESS: -30% EFFICACY", "#ff00ff");
            this.giEffectTimer = 3; // Effect lasts 3 seconds
        }
        if (this.giEffectTimer > 0) {
            this.giEffectTimer -= dt;
            totalEfficacyModifier *= 0.7;
        }

        this.patient.activeDrugs.forEach(id => {
            let drug = DRUGS[id];
            let drugEfficacy = drug.efficacy;
            let hypoChance = drug.hypoChance;

            // --- Interaction & Contraindication Logic ---

            // GLP-1 / DPP-4 Redundancy
            if (id === "DPP4" && this.patient.activeDrugs.has("GLP1")) {
                drugEfficacy = 0; 
            }

            // eGFR Scaled Efficacy
            if (this.patient.eGFR < 45) {
                if (id === "DPP4") drugEfficacy *= 0.5;   // 50% drop
                if (id === "SGLT2") drugEfficacy = 0.02;  // Drops to 0.02
            }

            // SU + Insulin (Amplified Hypo)
            if ((id === "SU" || id === "INS") && 
                this.patient.activeDrugs.has("SU") && 
                this.patient.activeDrugs.has("INS")) {
                hypoChance *= 2;
            }

            // Level 4: Food Insecurity (SU)
            if (this.level === 4 && id === "SU") hypoChance *= 3;

            // Apply HbA1c Reduction
            this.patient.HbA1c -= drugEfficacy * totalEfficacyModifier * dt;

            // Spawn Hypo Enemies
            if (Math.random() < hypoChance) this.spawnHypo();
        });
        

        // 3. Passive Hypo Recovery
        // Recovery is slower if on Insulin or Sulfonylurea
        const isOnHypoDrug = this.patient.activeDrugs.has("INS") || this.patient.activeDrugs.has("SU");
        if (!isOnHypoDrug) {
            this.patient.hypoRisk -= 2.0 * dt;
        }
        
        this.patient.HbA1c = Phaser.Math.Clamp(this.patient.HbA1c, 4.0, 15.0);
        this.patient.hypoRisk = Phaser.Math.Clamp(
            this.patient.hypoRisk,
            0,
            100,
        );
        this.patient.eGFR = Phaser.Math.Clamp(this.patient.eGFR, 0, 120);

        this.refreshUI(dt, oldHb, oldEgfr);
    }

    refreshUI(dt, oldHb, oldEgfr) {
        let hbTrend =
            this.level >=  2
                ? ` [${this.getTrend(this.patient.HbA1c, oldHb)}]`
                : "";
        this.hbText.setText(
            `HbA1c: ${this.patient.HbA1c.toFixed(1)}%${hbTrend}`,
        );
        this.hypoText.setText(
            `Hypo Risk: ${this.patient.hypoRisk.toFixed(0)}%`,
        );

        if (this.level >= 2) {
            let egTrend = ` [${this.getTrend(this.patient.eGFR, oldEgfr)}]`;
            this.egfrText.setText(
                `eGFR: ${this.patient.eGFR.toFixed(0)}${egTrend}`,
            );
            if (this.patient.eGFR < 30 && this.patient.activeDrugs.has("MET")) {
                this.patient.activeDrugs.delete("MET");
                this.flashMsg("METFORMIN STOPPED", "#f00");
            }
        }

        this.enemies.getChildren().forEach((e) => {
            e.x = e.body.x + 20;
            e.y = e.body.y + 20;
            if (e.label) e.label.setPosition(e.x, e.y);
            
            if (e.x > 750) {
                // Flash patient red on hit
                if (this.patientBody) {
                    this.patientBody.setFillStyle(0xff0000);
                    this.patientHead.setFillStyle(0xff0000);
                    this.time.delayedCall(300, () => {
                        if (this.patientBody) this.patientBody.setFillStyle(0x00ff88);
                        if (this.patientHead) this.patientHead.setFillStyle(0x00ff88);
                    });
                }
                
                if (e.isHypo) {
                    this.patient.hypoRisk += 25;
                    this.flashMsg("HYPO!", "#ffa500");

                    
                    } else if (e.isCkd) {
                        const isShielded = this.patient.activeDrugs.has("SGLT2") && this.patient.eGFR > 20;
                        let dmg = isShielded ? 2 : 7;
                        this.patient.eGFR -= dmg;
                        this.flashMsg(isShielded ? "SHIELDED" : "KIDNEY HIT", "#800080");

                    
                } else {
                    this.patient.HbA1c += 0.5;
                    this.flashMsg("+ SUGAR", "#f00");
                }
                if (e.label) e.label.destroy();
                e.destroy();
            }
        });

        // game win condition or stabilization

        const winTime = this.level === 4 ? 25 : 20;

        if (
            this.patient.HbA1c < 7.0 &&
            (this.level === 1 || this.patient.eGFR > 30)
        ) {
            if (this.level === 4 && this.patient.adherence < 50) {
                this.patient.stableTime = 0;
                this.statusText.setText("LOW ADHERENCE - CANNOT DISCHARGE").setColor("#ffff00");
            } else {
                this.patient.stableTime += dt;
                
                const remaining = Math.ceil(winTime - this.patient.stableTime);
                const months = Math.ceil(remaining * 1.5); // ~1.5 months per game second
                this.statusText
                    .setText(
                        `STABILIZING: ${remaining}s (~${months} mo)`,
                    )
                    .setColor("#0f0");
                
                if (this.patient.stableTime >= winTime)
                    this.end("Patient Stabilized!", true);
            }
            
        } else {
            this.patient.stableTime = 0;
            this.statusText.setText("UNSTABLE").setColor("#f00");
        }

        
        // game end conditions
        
        if (this.patient.hypoRisk >= 100) this.end("Hypoglycemic Coma");
        if (this.patient.HbA1c >= 10) this.end("Hyperglycemic Crisis");
        if (this.level >=  2 && this.patient.eGFR <= 14)
            this.end("Kidney Failure");
    }

    getTrend(curr, prev) {
        if (Math.abs(curr - prev) < 0.001) return "→";
        return curr > prev ? "↑" : "↓";
    }

    spawnHypo() {
        const e = this.add.circle(-20, 300, 20, 0xffa500);
        this.physics.add.existing(e);
        this.enemies.add(e);
        e.body.setVelocityX(200);
        e.label = this.add
            .text(e.x, e.y, "HYPO!", { fontSize: "12px", fontWeight: "bold" })
            .setOrigin(0.5);
        e.isHypo = true;
    }

    flashMsg(txt, col) {
        let t = this.add
            .text(400, 220, txt, {
                color: col,
                fontSize: "30px",
                fontWeight: "bold",
            })
            .setOrigin(0.5);
        this.tweens.add({
            targets: t,
            y: 120,
            alpha: 0,
            duration: 1000,
            onComplete: () => t.destroy(),
        });
    }

    async end(msg, win = false) {
        if (this.gameOver) return;
        this.gameOver = true;
        this.physics.pause();

        // Collect BEFORE drawing overlay (patient state is frozen)
        const sessionData = this.collectSessionData();
        // Override win with the actual parameter
        sessionData.win = win;
        if (win) sessionData.outcome = "Patient Stabilized";

        // Draw the overlay
        this.add.rectangle(400, 300, 800, 600, 0x000000, 0.9);
        this.add.text(400, 100, msg, {
            fontSize: "42px",
            color: win ? "#0f0" : "#f00",
            fontWeight: "bold",
        }).setOrigin(0.5);

        this.add.text(400, 220, "--- CLINICAL REPORT ---", {
            fontSize: "22px", color: "#fff", fontStyle: "italic",
        }).setOrigin(0.5);

        const reportStyle = { fontSize: "20px", color: "#00ffff", fontWeight: "bold" };

        this.add.text(400, 280, `Final HbA1c: ${this.patient.HbA1c.toFixed(1)}%`, {
            ...reportStyle, color: "#fff",
        }).setOrigin(0.5);

        if (this.level >= 2) {
            let ckdStage = this.getCKDStage(this.patient.eGFR);
            this.add.text(400, 330, `Final eGFR: ${this.patient.eGFR.toFixed(0)}`, reportStyle).setOrigin(0.5);
            this.add.text(400, 370, `STATUS: ${ckdStage}`, { fontSize: "18px", color: "#aaa" }).setOrigin(0.5);
        }

        // footer
        const footer = this.add.text(400, 460, "CLICK TO VIEW AI CLINICAL DEBRIEF", {
            fontSize: "20px", color: "#0f0", fontWeight: "bold",
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        //transition to debrief scene
        this.input.once("pointerdown", () => {
            this.scene.start("DebriefScene", { sessionData, msg, win });
        });
    }

    

    // Helper to translate eGFR to Clinical Stages
    getCKDStage(egfr) {
        if (egfr >= 90) return "Stage 1: Normal";
        if (egfr >= 60) return "Stage 2: Mild CKD";
        if (egfr >= 45) return "Stage 3a: Moderate CKD";
        if (egfr >= 30) return "Stage 3b: Moderate CKD";
        if (egfr >= 15) return "Stage 4: Severe CKD";
        return "Stage 5: End-Stage / Dialysis";
    }

    // Helper to gather session data for AI debrief
    
    collectSessionData() {
        // Level-specific patient profiles
        const PATIENT_PROFILES = {
            1: { name: "Mrs. Chen", history: "New T2DM diagnosis, no complications" },
            2: { name: "Mr. Williams", history: "T2DM + Stage 3a CKD, eGFR declining" },
            3: { name: "Mrs. Okonkwo", history: "T2DM + CKD + Obesity (BMI 36), full pharmacy" },
            4: { name: "Mr. Ahmed", history: "T2DM + CKD, recent immigrant, no drug coverage, food insecurity, limited English" }
        };

        const levelStartStats = {
            1: { HbA1c: 8.5, eGFR: 90 },
            2: { HbA1c: 8.5, eGFR: 90 },
            3: { HbA1c: 9.0, eGFR: 65 },
            4: { HbA1c: 9.2, eGFR: 55 }
        };

        // Determine outcome string
        let outcomeStr;
        if (this.patient.eGFR <= 14) {
            outcomeStr = "Kidney Failure (eGFR <= 14)";
        } else if (this.patient.hypoRisk >= 100) {
            outcomeStr = "Hypoglycemic Coma (Hypo Risk 100%)";
        } else if (this.patient.HbA1c >= 10) {
            outcomeStr = "Hyperglycemic Crisis (HbA1c >= 10%)";
        } else {
            outcomeStr = "Patient Stabilized";
        }

        return {
            level: this.level,
            win: !this.gameOver || outcomeStr === "Patient Stabilized",
            patientProfile: PATIENT_PROFILES[this.level] || PATIENT_PROFILES[1],
            startingStats: levelStartStats[this.level] || levelStartStats[1],
            finalStats: {
                HbA1c: this.patient.HbA1c.toFixed(1),
                eGFR: Math.round(this.patient.eGFR),
                hypoRisk: Math.round(this.patient.hypoRisk),
            },
            activeDrugsAtEnd: [...this.patient.activeDrugs].map(k => DRUGS[k]?.name || k),
            decisionHistory: this.decisionLog,
            outcome: outcomeStr,
            ...(this.level === 4 && { adherence: Math.round(this.patient.adherence || 100) })
        };
    }
}


class DebriefScene extends Phaser.Scene {
    constructor() {
        super("DebriefScene");
    }

    async init(data) {
        this.sessionData = data.sessionData;
        this.outcomeMsg = data.msg;
        this.win = data.win;
    }

    async create() {
    const { width, height } = this.scale;

        // Skip button - always visible
        const skipBtn = this.add.rectangle(700, 30, 100, 35, 0x555555).setInteractive({ useHandCursor: true });
        this.add.text(700, 30, "SKIP →", { fontSize: "14px", fontWeight: "bold" }).setOrigin(0.5);
        skipBtn.on("pointerdown", () => this.scene.start("GameScene", { level: 0 }));
        skipBtn.on("pointerover", () => skipBtn.setFillStyle(0x666666));
        skipBtn.on("pointerout", () => skipBtn.setFillStyle(0x555555));
        
    // 1. Create a "Window" (Mask)
    // This defines the area where text is VISIBLE (y: 100 to 450)
    const maskShape = this.make.graphics();
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(50, 100, 700, 350); 
    const mask = maskShape.createGeometryMask();

    const loadingText = this.add.text(400, 300, "Analyzing...", { color: '#888' }).setOrigin(0.5);

    try {
        const debriefText = await requestAIDebrief(this.sessionData);
        loadingText.destroy();

        // 2. Create the actual text object
        this.feedbackText = this.add.text(400, 110, debriefText, {
            fontSize: '18px',
            color: '#00ff00',
            align: 'left',
            lineSpacing: 10,
            wordWrap: { width: 680 },
            fontFamily: 'Courier'
        }).setOrigin(0.5, 0);

        // 3. Apply the mask to the text
        this.feedbackText.setMask(mask);

        // 4. Add Drag-to-Scroll Logic
        this.input.on('pointermove', (pointer) => {
            if (pointer.isDown) {
                this.feedbackText.y += (pointer.position.y - pointer.prevPosition.y);

                // Keep the text from scrolling too far away
                // Top limit: 110 | Bottom limit: depends on text height
                const contentHeight = this.feedbackText.height;
                const scrollLimit = 450 - contentHeight;
                this.feedbackText.y = Phaser.Math.Clamp(this.feedbackText.y, scrollLimit < 110 ? scrollLimit : 110, 110);
            }
        });

        // Add a small visual hint that they can scroll
        this.add.text(400, 470, "(Drag text to scroll)", { fontSize: '12px', color: '#444' }).setOrigin(0.5);

    // Button stays outside the mask so it's always visible
    const btn = this.add.rectangle(400, 540, 200, 45, 0x333333).setInteractive({ useHandCursor: true });
    this.add.text(400, 540, "MAIN MENU").setOrigin(0.5);
    btn.on('pointerdown', () => this.scene.start("GameScene", { level: 0 }),
            );
            btn.on("pointerover", () => btn.setFillStyle(0x444444));
            btn.on("pointerout", () => btn.setFillStyle(0x333333));
        } catch (err) {
            loadingText.setText("AI Unavailable\n\n" + err.message);
        }
    }}

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: "#222",
    physics: { default: "arcade" },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        parent: document.body,
    },
    scene: [GameScene, DebriefScene],
};

new Phaser.Game(config);
