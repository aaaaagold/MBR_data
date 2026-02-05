/*:
 * @plugindesc 綜合偷竊與回收系統(支援道具、武器、防具)
 * @author YourName
 * * @help
 * 1. 敵人備註設定 (StealPool)：
 * <StealPool: ["i338", "w50", "a20"]>
 * - i: 道具 (Item), w: 武器 (Weapon), a: 防具 (Armor)
 * - 也支援純數字 [338, 339]，系統會預設為道具。
 * * 2. 呼叫方式：
 * - 戰鬥開始初始化：MyActions.initEnemyStealPool();
 * - 敵人偷竊玩家：MyActions.stealItem();
 * - BOSS 強奪玩家：MyActions.bossStealAction();
 * - 玩家偷竊敵人：MyActions.playerStealFromEnemy();
 * - 戰後回收：(系統已自動掛載，不需手動呼叫)
 * - 維皮、哈瑞偷東西會優先偷note中有定義<女用內衣褲>的道具、防具或武器
 */

var MyActions = MyActions || {};
window.MyActions = MyActions;

(function ($) {
  "use strict";

  var CONFIG = {
    priorityTag: "<女用內衣褲>",
    blacklist: [307, 309, 310, 311, 313, 351, 459, 490],
    seSuccess: { name: "Miss", volume: 90, pitch: 120, pan: 0 },
    seFailure: { name: "Miss", volume: 90, pitch: 80, pan: 0 },
    seRecover: { name: "Item1", volume: 90, pitch: 100, pan: 0 },
  };

  // --- 基礎輔助函式 ---
  var isPriority = function (item) {
    return item && item.note && item.note.contains(CONFIG.priorityTag);
  };

  var parseItemCode = function (code) {
    if (typeof code === "number") return { id: code, type: "item" };
    if (typeof code !== "string") return null;
    var typeChar = code.charAt(0).toLowerCase();
    var id = parseInt(code.substring(1));
    if (isNaN(id)) return { id: parseInt(code), type: "item" };
    var type =
      typeChar === "w" ? "weapon" : typeChar === "a" ? "armor" : "item";
    return { id: id, type: type };
  };

  var getItemObject = function (data) {
    if (!data || !data.id) return null;
    if (data.type === "weapon") return $dataWeapons[data.id];
    if (data.type === "armor") return $dataArmors[data.id];
    return $dataItems[data.id];
  };

  // --- 1. 初始化 ---
  $.initEnemyStealPool = function () {
    $gameTroop.members().forEach(function (enemy) {
      if (!enemy._stolenItems) enemy._stolenItems = [];
      var note = enemy.enemy().note;
      var match = note.match(/<StealPool:\s*\[(.+?)\]>/);
      if (match) {
        try {
          var rawArray = JSON.parse("[" + match[1] + "]");
          enemy._myStealPool = rawArray.map(parseItemCode).filter(Boolean);
        } catch (e) {
          enemy._myStealPool = [];
        }
      } else {
        enemy._myStealPool = enemy._myStealPool || [];
      }
    });
  };

  // --- 2. 玩家偷敵人 ---
  $.playerStealFromEnemy = function () {
    var user = BattleManager._subject;
    var target =
      BattleManager._target || SceneManager._scene._enemyWindow.enemy();
    var logWindow = SceneManager._scene._logWindow;

    if (target && target._myStealPool && target._myStealPool.length > 0) {
      var pPool = [],
        nPool = [];
      target._myStealPool.forEach(function (d, i) {
        if (isPriority(getItemObject(d))) pPool.push(i);
        else nPool.push(i);
      });

      var usePriority = pPool.length > 0;
      var poolIndex = usePriority
        ? pPool[Math.floor(Math.random() * pPool.length)]
        : nPool[Math.floor(Math.random() * nPool.length)];
      var stolenData = target._myStealPool.splice(poolIndex, 1)[0];
      var item = getItemObject(stolenData);

      if (item) {
        $gameParty.gainItem(item, 1);
        AudioManager.playSe(CONFIG.seSuccess);
        if (usePriority) {
          // 移除所有換行造成的空格
          logWindow.addText(
            user.name() +
              "從" +
              target.name() +
              "身上摘下" +
              item.name +
              "，還帶點餘溫！",
          );
        } else {
          logWindow.addText(
            user.name() +
              "從" +
              target.name() +
              "身上偷到了" +
              item.name +
              "！",
          );
        }
        logWindow.push("wait");
      }
    } else {
      AudioManager.playSe(CONFIG.seFailure);
      logWindow.addText(
        target ? target.name() + "被你偷得連內褲都不剩。" : "沒有目標。",
      );
      logWindow.push("wait");
    }
  };

  // --- 3. 小怪偷玩家 ---
  $.stealItem = function () {
    var user = BattleManager._subject;
    if (!user) return;
    user._stolenItems = user._stolenItems || [];
    var logWindow = SceneManager._scene._logWindow;

    var pItems = [],
      nItems = [];
    $gameParty.items().forEach(function (item) {
      if (isPriority(item)) pItems.push(item);
      else if (
        item.itypeId === 1 &&
        !CONFIG.blacklist.contains(item.id) &&
        item.consumable
      )
        nItems.push(item);
    });

    var usePriority = pItems.length > 0;
    var potentialItems = usePriority ? pItems : nItems;

    if (potentialItems.length > 0) {
      AudioManager.playSe(CONFIG.seSuccess);
      var item =
        potentialItems[Math.floor(Math.random() * potentialItems.length)];
      user._stolenItems.push({ id: item.id, type: "item" });
      $gameParty.loseItem(item, 1);

      var msg = usePriority ? "卑鄙地偷走了你的" : "偷走了你的";
      logWindow.addText(user.name() + msg + item.name + "！");
      logWindow.push("wait");
    } else {
      AudioManager.playSe(CONFIG.seFailure);
      logWindow.addText(user.name() + "試圖偷竊，但什麼也沒找到。");
    }
  };

  // --- 4. 哈瑞偷竊 ---
  $.bossStealAction = function () {
    var user = BattleManager._subject;
    if (!user) return;
    user._stolenItems = user._stolenItems || [];
    var logWindow = SceneManager._scene._logWindow;

    var pTargets = [],
      nTargets = [];

    $gameParty.allMembers().forEach(function (actor) {
      actor.equips().forEach(function (e) {
        if (isPriority(e)) pTargets.push({ item: e, actor: actor });
      });
    });
    $gameParty.allItems().forEach(function (i) {
      if (isPriority(i)) pTargets.push({ item: i, actor: null });
      else if (!CONFIG.blacklist.contains(i.id))
        nTargets.push({ item: i, actor: null });
    });

    var usePriority = pTargets.length > 0;
    var pool = usePriority ? pTargets : nTargets;

    if (pool.length > 0) {
      AudioManager.playSe(CONFIG.seSuccess);
      var itemData = pool[Math.floor(Math.random() * pool.length)];
      var item = itemData.item;
      var type = DataManager.isArmor(item)
        ? "armor"
        : DataManager.isWeapon(item)
          ? "weapon"
          : "item";

      if (itemData.actor) {
        user._stolenItems.push({ id: item.id, type: type });
        itemData.actor.discardEquip(item);
      } else {
        var amt = $gameParty.numItems(item);
        for (var j = 0; j < amt; j++)
          user._stolenItems.push({ id: item.id, type: type });
        $gameParty.loseItem(item, amt);
      }

      if (usePriority) {
        logWindow.addText(
          user.name() + "宗師級的偷內衣技巧，偷走了全部的" + item.name + "！",
        );
      } else {
        logWindow.addText(
          user.name() + "從你身上偷走了全部的" + item.name + "！",
        );
      }
      logWindow.push("wait");
    } else {
      AudioManager.playSe(CONFIG.seFailure);
      logWindow.addText(user.name() + "看著你，覺得你很窮，嘆了口氣。");
    }
  };

  // --- 5. 戰後回收 ---
  $.recoverStolenItems = function () {
    var enemies = $gameTroop.deadMembers();
    var summary = {};
    var recoveredAny = false;

    enemies.forEach(function (enemy) {
      if (enemy._stolenItems && enemy._stolenItems.length > 0) {
        recoveredAny = true;
        enemy._stolenItems.forEach(function (d) {
          var item = getItemObject(d);
          if (item) {
            $gameParty.gainItem(item, 1);
            summary[item.name] = (summary[item.name] || 0) + 1;
          }
        });
        enemy._stolenItems = [];
      }
    });

    if (recoveredAny) {
      AudioManager.playSe(CONFIG.seRecover);
      for (var name in summary) {
        SceneManager._scene._logWindow.addText(
          "取回了" + summary[name] + "個" + name,
        );
        SceneManager._scene._logWindow.push("wait");
      }
    }
  };

  // --- 自動掛載 ---
  var _alias_Victory = BattleManager.processVictory;
  BattleManager.processVictory = function () {
    $.recoverStolenItems();
    _alias_Victory.call(this);
  };
})(MyActions);

/*:
 * 被動技能映射插件
 * 使用方法：
 * 在公共事件的「腳本」指令中輸入：
 * MyActions.learnPassiveSkills();
 * * 功能：
 * 1. 根據 SKILL_MAP 學習對應被動技能。
 * 2. 只要學會任一被動技能，自動掛上狀態 582 (用來顯示技能類型 21)。
 */

var MyActions = MyActions || {};
window.MyActions = MyActions;

(function ($) {
  "use strict";

  // --- 1. 技能書與狀態對照 (道具 ID : 狀態 ID) ---
  var BOOK_MAP = {
    511: 586,
    512: 82,
    513: 587,
    514: 614,
    515: 83,
    516: 588,
    517: 589,
    518: 278,
    519: 590,
    520: 591,
    521: 592,
    522: 280,
    523: 84,
    524: 593,
    525: 279,
    526: 89,
    527: 90,
    528: 85,
    529: 87,
    530: 86,
    531: 88,
    532: 594,
    533: 595,
    534: 596,
    535: 597,
    536: 277,
    537: 598,
    538: 81,
    539: 599,
    540: 600,
    541: 601,
    542: 602,
    543: 603,
    544: 604,
    545: 605,
    546: 606,
    547: 583,
    548: 607,
    549: 608,
    550: 609,
    551: 610,
    552: 576,
    553: 578,
    554: 579,
    555: 575,
    556: 580,
    557: 581,
    558: 611,
    559: 612,
    560: 613, // 560: 支援箭矢
  };

  // --- 2. 狀態與技能映射表 [狀態 ID, 技能 ID] ---
  var SKILL_MAP = [
    [586, 1451],
    [82, 1452],
    [587, 1453],
    [614, 1454],
    [83, 1455],
    [588, 1456],
    [589, 1457],
    [278, 1458],
    [590, 1459],
    [591, 1460],
    [592, 1461],
    [280, 1462],
    [84, 1463],
    [593, 1464],
    [279, 1465],
    [89, 1466],
    [90, 1467],
    [85, 1468],
    [87, 1469],
    [86, 1470],
    [88, 1471],
    [594, 1472],
    [595, 1473],
    [596, 1474],
    [597, 1475],
    [277, 1476],
    [598, 1477],
    [81, 1478],
    [599, 1479],
    [600, 1480],
    [601, 1481],
    [602, 1482],
    [603, 1483],
    [604, 1484],
    [605, 1485],
    [606, 1486],
    [583, 1487],
    [607, 1488],
    [608, 1489],
    [609, 1490],
    [610, 1491],
    [576, 1492],
    [578, 1493],
    [579, 1494],
    [575, 1495],
    [580, 1496],
    [581, 1497],
    [611, 1498],
    [612, 1499],
    [613, 1500],
  ];

  var TYPE_DISPLAY_STATE = 582;

  // --- 3. 被動技能自動刷新 (學習技能與顯示管理) ---
  $.learnPassiveSkills = function () {
    if (!$gameParty) return;
    $gameParty.members().forEach(function (actor) {
      var hasAnyPassive = false;
      SKILL_MAP.forEach(function (pair) {
        if (actor.isStateAffected(pair[0])) {
          if (!actor.isLearnedSkill(pair[1])) {
            actor.learnSkill(pair[1]);
          }
        }
        if (actor.isLearnedSkill(pair[1])) hasAnyPassive = true;
      });

      if (hasAnyPassive && !$gameParty.inBattle()) {
        if (!actor.isStateAffected(TYPE_DISPLAY_STATE)) {
          actor.addState(TYPE_DISPLAY_STATE);
        }
      }
    });
    if ($gamePlayer) $gamePlayer.refresh();
  };

  // --- 4. 核心功能：使用技能書 (含判讀、前置、互斥、角色限制) ---
  $.useSkillBook = function () {
    var item = $gameParty.lastItem();
    // 修正：使用 targetActor 確保抓到選單中點擊的角色對象
    var actor = BattleManager._subject || $gameParty.targetActor();

    if (!item || !actor) return;

    var itemId = item.id;
    var stateId = BOOK_MAP[itemId];

    if (!stateId) return;

    // A. 判定是否已學習
    if (actor.isStateAffected(stateId)) {
      AudioManager.playStaticSe({
        name: "Buzzer1",
        volume: 90,
        pitch: 100,
        pan: 0,
      });
      $gameMessage.add("您已學習過此被動技能！");
      $gameParty.gainItem(item, 1);
      return;
    }

    // B. 特殊限制：支援箭矢 (道具 560) 僅限角色 4 與 17
    if (itemId === 560) {
      var allowedActors = [4, 17];
      if (!allowedActors.contains(actor.actorId())) {
        AudioManager.playStaticSe({
          name: "Buzzer1",
          volume: 90,
          pitch: 100,
          pan: 0,
        });
        $gameMessage.add("此技能書僅限特定的射手角色使用。");
        $gameParty.gainItem(item, 1);
        return;
      }
    }

    // C. 前置需求：猛毒與燃燒
    if (itemId === 513 && !actor.isStateAffected(82)) {
      AudioManager.playStaticSe({
        name: "Buzzer1",
        volume: 90,
        pitch: 100,
        pan: 0,
      });
      $gameMessage.add("需先習得【免疫中毒】才可以學習此技能。");
      $gameParty.gainItem(item, 1);
      return;
    }
    if (itemId === 520 && !actor.isStateAffected(278)) {
      AudioManager.playStaticSe({
        name: "Buzzer1",
        volume: 90,
        pitch: 100,
        pan: 0,
      });
      $gameMessage.add("需先習得【免疫著火】才可以學習此技能。");
      $gameParty.gainItem(item, 1);
      return;
    }

    // D. 互斥需求：格擋與進擊 (二選一)
    if (itemId === 553 && actor.isStateAffected(579)) {
      AudioManager.playStaticSe({
        name: "Buzzer1",
        volume: 90,
        pitch: 100,
        pan: 0,
      });
      $gameMessage.add("已領悟【謹慎進擊】，無法學習【順勢格擋】。");
      $gameParty.gainItem(item, 1);
      return;
    }
    if (itemId === 554 && actor.isStateAffected(578)) {
      AudioManager.playStaticSe({
        name: "Buzzer1",
        volume: 90,
        pitch: 100,
        pan: 0,
      });
      $gameMessage.add("已領悟【順勢格擋】，無法學習【謹慎進擊】。");
      $gameParty.gainItem(item, 1);
      return;
    }

    // E. 通過所有檢查，執行學習
    AudioManager.playStaticSe({
      name: "Chime2",
      volume: 90,
      pitch: 100,
      pan: 0,
    });
    actor.addState(stateId);
    $gameMessage.add(actor.name() + " 成功學會了新的被動技能！");

    $.learnPassiveSkills();
  };

  // --- 5. 事件攔截與自動更新 ---
  var _BattleManager_setup = BattleManager.setup;
  BattleManager.setup = function (troopId, canEscape, canLose) {
    _BattleManager_setup.call(this, troopId, canEscape, canLose);
    $gameParty.allMembers().forEach(function (actor) {
      actor.removeState(TYPE_DISPLAY_STATE);
    });
  };

  var _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function () {
    _Scene_Map_onMapLoaded.call(this);
    $.learnPassiveSkills();
  };

  var _Scene_Menu_create = Scene_Menu.prototype.create;
  Scene_Menu.prototype.create = function () {
    $.learnPassiveSkills();
    _Scene_Menu_create.call(this);
  };
})(MyActions);

//技能標記 <itemSkill>就套用「道具效果提升」的加成。

(function () {
  var _Game_Action_itemEffectRecoverHp =
    Game_Action.prototype.itemEffectRecoverHp;
  Game_Action.prototype.itemEffectRecoverHp = function (target, effect) {
    var value = (target.mhp * effect.value1 + effect.value2) * target.rec;

    if (this.isSkill() && this.item().meta.itemSkill) {
      value *= this.subject().pha;
    }

    value *= this.lukEffectRate(target);
    value = Math.floor(value);
    if (value !== 0) {
      target.gainHp(value);
      this.makeSuccess(target);
    }
  };

  var _Game_Action_itemEffectRecoverMp =
    Game_Action.prototype.itemEffectRecoverMp;
  Game_Action.prototype.itemEffectRecoverMp = function (target, effect) {
    var value = target.mmp * effect.value1 + effect.value2;

    if (this.isSkill() && this.item().meta.itemSkill) {
      value *= this.subject().pha;
    }

    value = Math.floor(value);
    if (value !== 0) {
      target.gainMp(value);
      this.makeSuccess(target);
    }
  };
})();

//道具抽獎 1最大獎 4最小獎

var MyLottery = MyLottery || {};

(function () {
  var PRIZE_POOL = {
    1: [
      { id: 215, min: 1, max: 1 }, //奇蹟之靈
      { id: 261, min: 1, max: 1 }, //血腥瑪麗
      { id: 298, min: 1, max: 1 }, //薩奇的核桃
      { id: 304, min: 3, max: 5 }, //能力果實寶盒
      { id: 312, min: 1, max: 1 }, //能力果實大補帖
    ],
    2: [
      { id: 82, min: 1, max: 3 }, //升天飲
      { id: 96, min: 3, max: 5 }, //紫色還魄丹
      { id: 214, min: 1, max: 3 }, //奇蹟神水
      { id: 295, min: 1, max: 1 }, //聖光香水
      { id: 300, min: 1, max: 1 }, //防曬噴霧
      { id: 334, min: 1, max: 1 }, //炸藥包
      { id: 346, min: 1, max: 3 }, //英雄藥水
    ],
    3: [
      { id: 80, min: 1, max: 1 }, //神仙茶
      { id: 101, min: 1, max: 10 }, //回春骰子
      { id: 127, min: 1, max: 10 }, //生命骰子
      { id: 156, min: 1, max: 10 }, //魔力骰子
      { id: 193, min: 1, max: 1 }, //小愛的百合花蜜
      { id: 213, min: 1, max: 1 }, //奇蹟之水
      { id: 299, min: 1, max: 3 }, //防曬劑
      { id: 308, min: 1, max: 3 }, //愛情急救券
      { id: 336, min: 1, max: 3 }, //交杯酒
      { id: 337, min: 1, max: 3 }, //魔力吸收結晶
    ],
    4: [
      { id: 5, min: 3, max: 5 }, //神聖之水
      { id: 6, min: 1, max: 3 }, //生命之茶
      { id: 35, min: 3, max: 5 }, //魔法結晶
      { id: 36, min: 1, max: 3 }, //魔力之茶
      { id: 76, min: 1, max: 3 }, //蘋果派
      { id: 95, min: 1, max: 1 }, //聖女的饋贈
      { id: 124, min: 1, max: 1 }, //地脈聖水
      { id: 154, min: 1, max: 1 }, //魔力聖水
      { id: 183, min: 1, max: 1 }, //精靈花蜜
      { id: 212, min: 1, max: 3 }, //奇蹟之沙
      { id: 216, min: 1, max: 1 }, //奇蹟球棒
      { id: 260, min: 1, max: 3 }, //高粱酒
      { id: 263, min: 1, max: 1 }, //楷絲的啤酒
      { id: 264, min: 1, max: 1 }, //安特的聖花
      { id: 272, min: 1, max: 3 }, //萬靈香水
      { id: 288, min: 5, max: 10 }, //聖水
      { id: 296, min: 1, max: 3 }, //天下第一銷魂燒肉
      { id: 297, min: 3, max: 5 }, //天下第一銷魂屍塊
      { id: 335, min: 1, max: 1 }, //毒酒膽
      { id: 364, min: 1, max: 3 }, //醫護帳篷
    ],
  };

  MyLottery.drawOnce = function (showMsg) {
    var rand = Math.random() * 100;
    var rank = 4;

    if (rand < 0.5) rank = 1;
    else if (rand < 3.0) rank = 2;
    else if (rand < 28.0) rank = 3;
    else rank = 4;

    var pool = PRIZE_POOL[rank];
    var prizeData = pool[Math.floor(Math.random() * pool.length)];
    var item = $dataItems[prizeData.id];

    var min = prizeData.min || 1;
    var max = prizeData.max || 1;
    var count = Math.floor(Math.random() * (max - min + 1)) + min;

    $gameParty.gainItem(item, count);
    AudioManager.playStaticSe({ name: "Item1", volume: 90, pitch: 100 });
    var countText = count > 1 ? count + "個" : "";
    var msg = "獲得了 " + item.name + " " + countText;

    if (showMsg) {
      $gameMessage.add(msg.trim() + "！");
    }

    return { item: item, count: count };
  };

  MyLottery.drawTen = function () {
    var results = [];
    for (var i = 0; i < 10; i++) {
      results.push(MyLottery.drawOnce(false));
    }

    results.forEach(function (res) {
      var countText = res.count > 1 ? res.count + "個" : "";
      $gameMessage.add("獲得了 " + res.item.name + " " + countText);
    });
  };
})();

//武器、防具轉蛋

var MyEquipLottery = MyEquipLottery || {};

(function () {
  var EQUIP_POOL = {
    1: [
      "w18", //朱雀刀
      "w47", //青龍劍
      "w166", //白虎杖
      "w167", //玄武杖
      "w174", //帶骨肉棒棒
      "w342", //怨念長刀
      "w343", //小刀加能量槍
      "w404", //銀龍短劍
      "w405", //名劍疾風
      "w406", //判刀村反
      "w452", //愛之弓
      "w494", //激勵皮鞭
      "w546", //三色杖
      "w547", //工匠的鐵槌
      "a349", //白虎聖袍
      "a350", //玄武聖袍
      "a377", //朱雀環甲
      "a409", //青龍鎧甲
      "a875", //見習勇者資格證
      "a892", //斂財琴
      "a895", //白虎玉珮
      "a896", //朱雀玉珮
      "a897", //青龍玉珮
      "a898", //玄武玉珮
      "a999", //大魔導師頭冠
      "a1007", //達克特頭帶
      "a1016", //勇氣頭盔
      "a1022", //魔法布衣
      "a1024", //白霧大衣
      "a1035", //併唱法袍
      "a1036", //渦流長袍
      "a1046", //星辰環甲
      "a1132", //殘影手套
      "a1160", //神通鑰匙
      "a1161", //勇者之戒
      "a1162", //最後的希望
      "a1163", //死者的借據
    ],
    2: [
      "w15", //電鋸
      "w44", //謝頂之劍
      "w56", //白翼劍
      "w171", //死鐮之杖
      "w176", //安特之杖
      "w205", //光束能量槍
      "w335", //野蠻刺刀
      "w336", //暗殺匕首
      "w337", //仙界寶刀
      "w338", //月夜刀
      "w397", //號令之劍
      "w398", //鬥氣劍
      "w446", //金剛芋頭炮
      "w487", //失意藤鞭
      "w488", //屍毒鐵鞭
      "w540", //萬寶槌
      "w587", //爆碎斧
      "a9", //光明大法師
      "a76", //荒野頭巾
      "a305", //和服
      "a306", //光學迷彩
      "a351", //魔藥法袍
      "a613", //標靶護手
      "a614", //勇氣手環
      "a652", //最終箭筒
      "a880", //渾沌魔石
      "a881", //焚嵐魔石
      "a882", //海雷魔石
      "a883", //霜脈魔石
      "a900", //榮譽團員勳章
      "a901", //古代耳塞
      "a978", //速度檢定器
      "a979", //分析者頭冠
      "a989", //羅煞面具
      "a990", //神聖頭鍊
      "a991", //巫毒娃娃
      "a997", //天賜頭箍
      "a998", //治癒頭冠
      "a1015", //忍耐頭盔
      "a1023", //牧者檻歌
      "a1045", //荊棘藤甲
      "a1060", //堡壘戰甲
      "a1128", //藥師手套
      "a1129", //格尼爾腕甲
      "a1131", //變身手環
      "a1144", //聖戰大盾
      "a1145", //卡薩克重盾
      "a1158", //百寶箱
      "a1159", //一閃流星
    ],
    3: [
      "w13", //日炎刀
      "w16", //三元之刃
      "w14", //利血爪
      "w42", //月雷劍
      "w128", //星土鞭
      "w172", //結實的蘿蔔
      "w187", //公事包
      "w207", //手槍
      "w325", //霸王刀
      "w384", //奧利哈剛之劍
      "w385", //高能結晶劍
      "w429", //蛛網發射器
      "w430", //超重型弓
      "w431", //鹿角大弓
      "w432", //響穿之弓
      "w438", //附魔弓
      "w439", //魔能追擊弓
      "w440", //五色弓
      "w475", //九龍鞭
      "w481", //倍痛鐵鞭
      "w525", //大魔法師長杖
      "w531", //神鳥法杖
      "w532", //海龍法杖
      "w533", //靈龜法杖
      "w534", //邪豹法杖
      "w574", //斬龍斧
      "w575", //噴射斧
      "w581", //一刀兩斷斧
      "a6", //OK繃
      "a7", //天使羽毛
      "a122", //寒霜之巔
      "a123", //頭上萬靈藥
      "a124", //明王憤怒
      "a125", //山羊角飾
      "a155", //護士帽
      "a158", //聖少女百合
      "a159", //草支擺
      "a163", //海妖歌謠
      "a352", //綠葉法袍
      "a372", //魔彈藤甲
      "a402", //鬼魂戰甲
      "a611", //麵包護腕
      "a612", //藍色手環
      "a615", //聖水手環
      "a616", //五彩斑斕
      "a618", //梅杜莎手環
      "a650", //獸骨箭筒
      "a651", //銀枝箭筒
      "a677", //哥布林巨盾
      "a851", //火之戒指
      "a852", //雷之戒指
      "a853", //冰之戒指
      "a854", //風之戒指
      "a855", //土之戒指
      "a856", //水之戒指
      "a857", //光之戒指
      "a858", //暗之戒指
      "a873", //怒之戒指
      "a874", //興奮戒指
      "a889", //魔晶戒指
      "a965", //巫月耳環
      "a966", //水月耳環
      "a986", //快攻頭巾
      "a987", //續能髮飾
      "a1006", //喝啤酒涼帽
      "a1031", //魔癒長袍
      "a1033", //火焰長袍
      "a1034", //毅力長袍
      "a1044", //雷提斯皮甲
      "a1059", //振奮鐵甲
      "a1126", //勇者護手
      "a1127", //賢者護手
      "a1143", //獅頭大盾
    ],
    4: [
      "w10", //忍者刀
      "w28", //馬大嬸菜刀
      "w25", //妖精的嘆息
      "w39", //龍泉劍
      "w57", //妖精的回音
      "w64", //鍛鋼護手劍
      "w94", //仙靈弓
      "w95", //妖精的旋律
      "w96", //糖心弓
      "w97", //獵手神弓
      "w129", //妖精的呼吸
      "w130", //妃糖鞭
      "w163", //女神之杖
      "w173", //鋤草農具
      "w175", //妖精的餽贈
      "w184", //銀刃斧
      "w185", //妖精的輓歌
      "w189", //拐杖斧
      "a5", //狼皮帽
      "a11", //妖花頭環
      "a12", //颶風羽環
      "a38", //聖者帽
      "a40", //狂咒帽
      "a44", //龍鱗法帽
      "a67", //影之頭巾
      "a69", //奮勇頭巾
      "a74", //龍鱗皮帽
      "a98", //金盔
      "a100", //慎盔
      "a104", //龍鱗鋼盔
      "a126", //青鬼之角
      "a127", //赤鬼之角
      "a128", //焰魔角飾
      "a156", //妖花玫瑰
      "a157", //青絲領花結
      "a340", //影之魔袍
      "a346", //龍鱗袍法鎮
      "a347", //龍鱗袍天幸
      "a368", //影之忍服
      "a374", //龍鱗環甲殘影
      "a375", //龍鱗環甲神影
      "a399", //地獄鎧甲
      "a406", //龍鱗鎧甲不動
      "a407", //龍鱗鎧甲御魔
      "a408", //龍鱗鎧甲天幸
      "a604", //熱血手環
      "a607", //晶石手環
      "a610", //神運手環
      "a617", //旅行者的祝福
      "a644", //無限箭筒
      "a669", //白金鋼盾
      "a674", //龍鱗鋼盾
      "a866", //強化力量戒指
      "a867", //強化魔力戒指
      "a868", //強化防禦戒指
      "a869", //強化幸運戒指
      "a870", //強化速度戒指
      "a888", //毒之戒指
      "a890", //閃鑽戒指
      "a894", //閃鑽項鍊
      "a941", //鋼鐵丁字褲
      "a974", //血泉耳環
      "a975", //魔泉耳環
      "a976", //含嘴裡的蘋果派
      "a980", //清淨掛帽
      "a1005", //祝福小帽
    ],
  };

  MyEquipLottery.drawOnce = function (showMsg) {
    var rand = Math.random() * 100;
    var rank = 4;

    if (rand < 0.5) rank = 1;
    else if (rand < 3.0) rank = 2;
    else if (rand < 28.0) rank = 3;
    else rank = 4;

    var pool = EQUIP_POOL[rank];
    var rawCode = pool[Math.floor(Math.random() * pool.length)];

    var type = rawCode.charAt(0).toLowerCase();
    var id = parseInt(rawCode.substring(1));

    var equip;
    if (type === "w") {
      equip = $dataWeapons[id];
    } else if (type === "a") {
      equip = $dataArmors[id];
    }

    if (equip) {
      $gameParty.gainItem(equip, 1);
      AudioManager.playStaticSe({ name: "Item1", volume: 90, pitch: 100 });

      if (showMsg) {
        $gameMessage.add("獲得" + equip.name + "！");
      }
      return equip;
    }
    return null;
  };

  MyEquipLottery.drawTen = function () {
    var results = [];
    for (var i = 0; i < 10; i++) {
      var res = MyEquipLottery.drawOnce(false);
      if (res) results.push(res);
    }

    results.forEach(function (equip) {
      $gameMessage.add("獲得" + equip.name);
    });
  };
})();
