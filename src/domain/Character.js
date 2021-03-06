// @flow

import BaseStats, {NullCharacterStats} from "./CharacterStats";
import OptimizationPlan from "./OptimizationPlan";
import characterSettings from "../constants/characterSettings";
import {CharacterSettings, GameSettings, OptimizerSettings, PlayerValues} from "./CharacterDataClasses";
import groupByKey from "../utils/groupByKey";
import {mapObject} from "../utils/mapObject";

export default class Character {
  baseID;
  defaultSettings;
  gameSettings;
  playerValues;
  optimizerSettings;

  /**
   * @param baseID String
   * @param defaultSettings {CharacterSettings} Deprecated. The unchangeable default settings for a character, including
   *                                            its damage type, default targets, and extra searchable tags
   * @param gameSettings {GameSettings} Deprecated. The unchangeable settings for a character from in-game, including
   *                                    tags, name, etc.
   * @param playerValues {PlayerValues} The player-specific character values from the game, like level, stars, etc.
   * @param optimizerSettings {OptimizerSettings} Settings specific to the optimizer,
   *                                            such as what target to use, and whether to lock mods
   */
  constructor(baseID,
              defaultSettings = null,
              gameSettings = null,
              playerValues = null,
              optimizerSettings = null,
  ) {
    this.baseID = baseID;
    this.defaultSettings = defaultSettings;
    this.gameSettings = gameSettings;
    this.playerValues = playerValues;
    this.optimizerSettings = optimizerSettings;

    Object.freeze(this);
  }

  /**
   * Return a shallow copy of this character
   */
  clone() {
    return new Character(
      this.baseID,
      this.defaultSettings,
      this.gameSettings,
      Object.assign({}, this.playerValues),
      Object.assign({}, this.optimizerSettings)
    );
  }

  /**
   * Create a new Character object that matches this one, but with defaultSettings overridden
   * @param defaultSettings CharacterSettings
   */
  withDefaultSettings(defaultSettings) {
    if (defaultSettings) {
      return new Character(
        this.baseID,
        defaultSettings,
        this.gameSettings,
        this.playerValues,
        this.optimizerSettings
      );
    } else {
      return this;
    }
  }

  /**
   * Create a new Character object that matches this one, but with gameSettings overridden
   * @param gameSettings GameSettings
   */
  withGameSettings(gameSettings) {
    if (gameSettings) {
      return new Character(
        this.baseID,
        this.defaultSettings,
        gameSettings,
        this.playerValues,
        this.optimizerSettings
      );
    } else {
      return this;
    }
  }

  /**
   * Create a new Character object that matches this one, but with playerValues overridden
   * @param playerValues
   */
  withPlayerValues(playerValues) {
    if (playerValues) {
      return new Character(
        this.baseID,
        this.defaultSettings,
        this.gameSettings,
        playerValues,
        this.optimizerSettings
      );
    } else {
      return this;
    }
  }

  /**
   * Create a new Character object that matches this one, but with optimizerSettings overridden
   * @param optimizerSettings
   */
  withOptimizerSettings(optimizerSettings) {
    if (optimizerSettings) {
      return new Character(
        this.baseID,
        this.defaultSettings,
        this.gameSettings,
        this.playerValues,
        optimizerSettings
      );
    } else {
      return this;
    }
  }

  /**
   * Reset the current target to match the default, and update it in optimizer settings as well
   */
  withResetTarget(targetName) {
    return new Character(
      this.baseID,
      this.defaultSettings,
      this.gameSettings,
      this.playerValues,
      this.optimizerSettings.withTarget(
        characterSettings[this.baseID] ?
          characterSettings[this.baseID].targets.find(target => target.name === targetName) :
          null
      )
    );
  }

  /**
   * Return a new Character object that matches this one, but with all targets reset to match their defaults
   */
  withResetTargets() {
    return new Character(
      this.baseID,
      this.defaultSettings,
      this.gameSettings,
      this.playerValues,
      this.optimizerSettings.withTargetOverrides(
        characterSettings[this.baseID] ? characterSettings[this.baseID].targets : []
      )
    );
  }

  /**
   * Return a new Character object that matches this one, but with the given target deleted
   * @param targetName {String} The name of the target to delete
   */
  withDeletedTarget(targetName) {
    const newOptimizerSettings = this.optimizerSettings
      .withDeletedTarget(targetName);

    return new Character(
      this.baseID,
      this.defaultSettings,
      this.gameSettings,
      this.playerValues,
      newOptimizerSettings
    );
  }

  /**
   * Get a set of all targets that can be set for this character
   */
  targets() {
    const defaultTargets = groupByKey(
      characterSettings[this.baseID] ? characterSettings[this.baseID].targets : [],
      target => target.name
    );
    const playerTargets = groupByKey(this.optimizerSettings.targets, target => target.name);

    return Object.values(Object.assign({}, defaultTargets, playerTargets));
  }

  defaultTarget() {
    return this.targets()[0] || new OptimizationPlan('unnamed');
  }

  /**
   * Comparison function useful for sorting characters by Galactic Power. If that has a higher GP, returns a value > 0.
   * If this has a higher GP, returns a value < 0. If the GPs are the same, returns a value to sort by character name.
   * @param that Character
   */
  compareGP(that) {
    if (that.playerValues.galacticPower === this.playerValues.galacticPower) {
      return this.baseID.localeCompare(that.baseID);
    }
    return that.playerValues.galacticPower - this.playerValues.galacticPower;
  }

  serialize() {
    let characterObject = {};

    characterObject.baseID = this.baseID;
    if (this.defaultSettings) {
      characterObject.defaultSettings = this.defaultSettings.serialize();
    }
    if (this.gameSettings) {
      characterObject.gameSettings = this.gameSettings ? this.gameSettings.serialize() : null;
    }
    characterObject.playerValues = this.playerValues ? this.playerValues.serialize() : null;
    characterObject.optimizerSettings = this.optimizerSettings ? this.optimizerSettings.serialize() : null;

    return characterObject;
  }

  static deserialize(characterJson) {
    return new Character(
      characterJson.baseID,
      characterJson.defaultSettings ? CharacterSettings.deserialize(characterJson.defaultSettings) : null,
      characterJson.gameSettings ?
        GameSettings.deserialize(Object.assign(characterJson.gameSettings, {baseID: characterJson.baseID})) :
        null,
      PlayerValues.deserialize(characterJson.playerValues),
      OptimizerSettings.deserialize(characterJson.optimizerSettings)
    );
  }

  static deserializeVersionOneTwo(characterJson) {
    const serializedNamedPlans = characterJson.namedPlans || {
      unnamed: characterJson.optimizationPlan
    };

    const namedPlans = Object.values(mapObject(serializedNamedPlans, OptimizationPlan.deserialize));

    let selectedTarget = OptimizationPlan.deserialize(characterJson.optimizationPlan);

    // If the selected plan is unnamed, try to find if a matching plan does exist, so that the matching plan can
    // be selected
    if ('unnamed' === selectedTarget.name) {
      namedPlans.forEach(target => {
        if (selectedTarget.rename(target.name).equals(target)) {
          selectedTarget = target;
        }
      });
    }

    const gameSettings = new GameSettings(
      characterJson.name,
      '//swgoh.gg/static/img/assets/blank-character.png',
      [],
      ''
    );
    const playerValues = new PlayerValues(
      characterJson.level,
      characterJson.starLevel,
      characterJson.gearLevel,
      characterJson.gearPieces,
      characterJson.galacticPower,
      characterJson.baseStats ? BaseStats.deserialize(characterJson.baseStats) : NullCharacterStats,
      characterJson.totalStats ? BaseStats.deserialize(characterJson.totalStats) : NullCharacterStats,
    );
    const optimizerSettings = new OptimizerSettings(
      selectedTarget,
      namedPlans || [],
      characterJson.useOnly5DotMods ? 5 : 1,
      characterJson.sliceMods || false,
      characterJson.isLocked || false
    );

    return new Character(
      characterJson.baseID,
      characterSettings[characterJson.baseID] || null,
      gameSettings,
      playerValues,
      optimizerSettings
    );
  }
}
