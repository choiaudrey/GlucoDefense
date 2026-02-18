class GameScene extends Phaser.Scene {

  constructor() {
      super("GameScene");
  }

  create() {
      this.patient = {
          HbA1c: 9.2,
          eGFR: 80,
          weight: 102,
          CV_risk: 10,
          hypoglycemia_risk: 5
      };

      this.hba1cText = this.add.text(20, 20, "", { fontSize: "20px", color: "#ffffff" });
      this.egfrText = this.add.text(20, 45, "", { fontSize: "20px", color: "#ffff00" });
      this.weightText = this.add.text(20, 70, "", { fontSize: "20px", color: "#ffffff" });

      this.cvRiskText = this.add.text(620, 20, "", { fontSize: "20px", color: "#ff0000" });
      this.hypoRiskText = this.add.text(620, 45, "", { fontSize: "20px", color: "#ffa500" });

      this.updateVitalsUI();

      this.enemies = this.physics.add.group();
      this.gameOver = false;
      this.startTime = this.time.now;

      this.time.addEvent({
          delay: 2000,
          callback: this.spawnEnemy,
          callbackScope: this,
          loop: true
      });

      this.input.on("pointerdown", () => {
          this.activateMetformin();
      });
  }

  spawnEnemy() {
      if (this.gameOver) return;

      const elapsed = (this.time.now - this.startTime) / 1000;
      let pool = ['METABOLIC'];
      if (elapsed > 10) {
          pool.push('RENAL', 'CARDIOVASCULAR', 'HYPOGLYCEMIA');
      }

      const type = Phaser.Utils.Array.GetRandom(pool);
      let config = { color: 0xffff00, label: 'GLUCOSE', hp: 1 };

      if (type === 'RENAL') config = { color: 0x800080, label: 'CKD', hp: 2 };
      if (type === 'CARDIOVASCULAR') config = { color: 0xff0000, label: 'CV RISK', hp: 3 };
      if (type === 'HYPOGLYCEMIA') config = { color: 0xffa500, label: 'HYPO', hp: 1 };

      const enemy = this.add.rectangle(0, 300, 30, 30, config.color);
      this.physics.add.existing(enemy);
      enemy.body.setVelocityX(150);
      enemy.type = type;
      enemy.hp = config.hp;

      console.log('enemy velocity:', enemy.body.velocity.x);

      const label = this.add.text(0, 270, config.label, { fontSize: '12px', color: '#ffffff' }).setOrigin(0.5);
      enemy.labelText = label;

      this.enemies.add(enemy);
  }

  update(time, delta) {
      if (this.gameOver) return;

      this.updateVitalsUI();

      if (this.patient.CV_risk >= 100) this.triggerGameOver("CV Risk too high!");
      else if (this.patient.hypoglycemia_risk >= 100) this.triggerGameOver("Hypoglycemia Risk too high!");
      else if (this.patient.eGFR <= 10) this.triggerGameOver("eGFR too low!");

      this.enemies.getChildren().forEach(enemy => {
          if (enemy.labelText) {
              enemy.labelText.x = enemy.x;
          }

          if (enemy.x >= 750) {
              this.applyDamage(enemy.type);
              if (enemy.labelText) enemy.labelText.destroy();
              enemy.destroy();
          }
      });
  }

  applyDamage(type) {
      if (type === 'METABOLIC') {
          this.patient.HbA1c += 0.2;
          this.patient.CV_risk += 2;
      } else if (type === 'RENAL') {
          this.patient.eGFR -= 3;
      } else if (type === 'CARDIOVASCULAR') {
          this.patient.CV_risk += 10;
      } else if (type === 'HYPOGLYCEMIA') {
          this.patient.hypoglycemia_risk += 20;
      }
      this.updateVitalsUI();
  }

  activateMetformin() {
      if (this.patient.HbA1c > 6) {
          this.patient.HbA1c -= 0.5;
          this.updateVitalsUI();
      }
  }

  updateVitalsUI() {
      this.hba1cText.setText("HbA1c: " + this.patient.HbA1c.toFixed(1));
      this.egfrText.setText("eGFR: " + this.patient.eGFR);
      this.weightText.setText("Weight: " + this.patient.weight + " kg");
      this.cvRiskText.setText("CV Risk: " + this.patient.CV_risk.toFixed(1) + "%");
      this.hypoRiskText.setText("Hypo Risk: " + this.patient.hypoglycemia_risk.toFixed(1) + "%");
  }

  triggerGameOver(reason) {
      if (this.gameOver) return;
      this.gameOver = true;
      this.physics.pause();
      this.add.rectangle(400, 300, 800, 600, 0x000000, 0.7);
      this.add.text(400, 300, "GAME OVER\n" + reason, {
          fontSize: "48px",
          color: "#ff0000",
          align: "center"
      }).setOrigin(0.5);
  }

}

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#1e1e1e",
  physics: { 
      default: 'arcade',
      arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: [GameScene]
};

const game = new Phaser.Game(config);
