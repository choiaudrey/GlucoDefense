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

      // New Vitals Panel (Right side x=620)
      this.cvRiskText = this.add.text(620, 20, "", { fontSize: "20px", color: "#ff0000" });
      this.hypoRiskText = this.add.text(620, 45, "", { fontSize: "20px", color: "#ffa500" });

      this.updateVitalsUI();

      this.enemies = this.physics.add.group();
      this.spawnEnemy();

      this.input.on("pointerdown", () => {
          this.activateMetformin();
      });

      this.time.addEvent({
          delay: 3000,
          callback: this.spawnEnemy,
          callbackScope: this,
          loop: true
      });

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

  spawnEnemy() {
      const enemy = this.add.circle(0, 300, 15, 0xff0000);
      this.physics.add.existing(enemy);
      enemy.body.setVelocityX(500);
      this.enemies.add(enemy);
  }

  activateMetformin() {
      if (this.patient.HbA1c > 6) {
          this.patient.HbA1c -= 0.5;
          this.updateVitalsUI();
      }
  }

  update(time, delta) {
      if (this.gameOver) return;

      this.updateVitalsUI();

      if (this.patient.CV_risk >= 100) {
          this.triggerGameOver("CV Risk too high!");
      } else if (this.patient.hypoglycemia_risk >= 100) {
          this.triggerGameOver("Hypoglycemia Risk too high!");
      } else if (this.patient.eGFR <= 10) {
          this.triggerGameOver("eGFR too low!");
      }

      this.enemies.getChildren().forEach(enemy => {

          if (enemy.x > 800) {
              enemy.destroy();
              this.patient.HbA1c += 0.2;
              this.updateVitalsUI();
          }

      });
  }

}

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#1e1e1e",
  physics: { default: 'arcade' },
  scene: [GameScene]
};

const game = new Phaser.Game(config);
