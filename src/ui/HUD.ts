import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../config/constants";
import { SHOP_ITEMS, type Item } from "../config/unitStats";
import type { GameState } from "../types";

export class HUD {
  private goldText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private itemSlots: Phaser.GameObjects.Container[] = [];
  private shopContainer!: Phaser.GameObjects.Container;

  constructor(private scene: Phaser.Scene, private state: GameState) {}

  create(onShopToggle: () => void, onTargetingToggle: () => void): void {
    this.goldText = this.scene.add
      .text(GAME_WIDTH - 20, GAME_HEIGHT - 30, "500", {
        fontSize: "20px",
        fontStyle: "bold",
        color: "#FFD700",
        stroke: "#000",
        strokeThickness: 3,
        padding: { x: 8, y: 4 },
      })
      .setOrigin(1, 0)
      .setDepth(100)
      .setInteractive();
    this.goldText.on("pointerdown", onShopToggle);

    this.statsText = this.scene.add
      .text(GAME_WIDTH - 20, GAME_HEIGHT - 55, "LH: 0 | D: 0", {
        fontSize: "14px",
        color: "#ccc",
        stroke: "#000",
        strokeThickness: 2,
      })
      .setOrigin(1, 0)
      .setDepth(100);

    this.createItemSlots(onTargetingToggle);
    this.createShopUI(onShopToggle);
  }

  private createItemSlots(onTargetingToggle: () => void): void {
    const labels = ["W", "A", "S"];
    const types = ["weapon", "armor", "accessory"] as const;

    for (let i = 0; i < 3; i++) {
      const container = this.scene.add.container(35, 60 + i * 55).setDepth(100);
      const bg = this.scene.add.rectangle(0, 0, 50, 50, 0x1a1a1a).setStrokeStyle(2, 0x444444);
      const label = this.scene.add
        .text(0, 0, labels[i], { fontSize: "16px", fontStyle: "bold", color: "#666" })
        .setOrigin(0.5);
      container.add([bg, label]);
      container.setSize(50, 50).setInteractive();
      container.on("pointerdown", () => {
        const heroA = this.state.units.get("hero-A");
        if (!heroA) return;
        if (
          types[i] === "armor" &&
          heroA.data.armor?.id === "divine-shield" &&
          heroA.data.itemCooldown <= 0
        ) {
          onTargetingToggle();
        }
      });
      this.itemSlots.push(container);
    }
  }

  private createShopUI(onShopToggle: () => void): void {
    this.shopContainer = this.scene.add.container(0, 0).setDepth(200).setVisible(false);
    this.shopContainer.add(
      this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.85)
    );
    this.shopContainer.add(
      this.scene.add
        .text(GAME_WIDTH / 2, 20, "Shop", { fontSize: "22px", fontStyle: "bold", color: "#FFD700" })
        .setOrigin(0.5)
    );

    SHOP_ITEMS.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = GAME_WIDTH * 0.28 + col * (GAME_WIDTH * 0.44);
      const y = 65 + row * 55;
      const btnW = GAME_WIDTH * 0.4;
      const btn = this.scene.add.rectangle(x, y, btnW, 45, 0x4a4a4a).setStrokeStyle(1, 0x666666).setInteractive();
      btn.on("pointerdown", () => this.purchaseItem(item));
      this.shopContainer.add([
        btn,
        this.scene.add.text(x - btnW / 2 + 8, y - 12, `${item.name} - ${item.cost}g`, {
          fontSize: "13px",
          fontStyle: "bold",
          color: "#FFD700",
        }),
        this.scene.add.text(x - btnW / 2 + 8, y + 6, item.description, {
          fontSize: "9px",
          color: "#ccc",
          wordWrap: { width: btnW - 16 },
        }),
      ]);
    });

    const closeBtn = this.scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 30, "Close", {
        fontSize: "14px",
        fontStyle: "bold",
        color: "#fff",
        backgroundColor: "#666",
        padding: { x: 25, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive();
    closeBtn.on("pointerdown", onShopToggle);
    this.shopContainer.add(closeBtn);
  }

  toggleShop(): void {
    this.state.shopOpen = !this.state.shopOpen;
    this.shopContainer.setVisible(this.state.shopOpen);
  }

  private purchaseItem(item: Item): void {
    const heroA = this.state.units.get("hero-A");
    if (!heroA || heroA.data.gold < item.cost) return;
    if (item.type === "weapon" && heroA.data.weapon) return;
    if (item.type === "armor" && heroA.data.armor) return;
    if (item.type === "accessory" && heroA.data.accessory) return;

    heroA.data.gold -= item.cost;
    if (item.type === "weapon") heroA.data.weapon = item;
    if (item.type === "armor") heroA.data.armor = item;
    if (item.type === "accessory") heroA.data.accessory = item;
  }

  update(targetingMode: boolean): void {
    const heroA = this.state.units.get("hero-A");
    if (!heroA) return;

    this.goldText.setText(`${heroA.data.gold}`);
    this.statsText.setText(`LH: ${this.state.lastHits} | D: ${this.state.denies}`);

    const items = [heroA.data.weapon, heroA.data.armor, heroA.data.accessory];
    const labels = ["W", "A", "S"];
    for (let i = 0; i < 3; i++) {
      const bg = this.itemSlots[i].getAt(0) as Phaser.GameObjects.Rectangle;
      const label = this.itemSlots[i].getAt(1) as Phaser.GameObjects.Text;
      if (items[i]) {
        bg.setFillStyle(targetingMode && i === 1 ? 0x4fc3f7 : 0x2a2a2a);
        bg.setStrokeStyle(2, COLORS.GOLD);
        label.setColor("#FFD700").setText(items[i]!.name.split(" ")[0]).setFontSize(10);
      } else {
        bg.setFillStyle(0x1a1a1a).setStrokeStyle(2, 0x444444);
        label.setColor("#666").setText(labels[i]).setFontSize(18);
      }
    }
  }
}
