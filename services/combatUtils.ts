import { Ability, CombatUnit } from '../types';
import { hasPerk } from './perkService';

export const POLEARM_ADJACENT_HIT_PENALTY = -15;

const isPolearmWeapon = (unit: CombatUnit): boolean => {
  const weapon = unit.equipment.mainHand;
  if (!weapon) return false;
  const cls = weapon.combatClass || weapon.weaponClass;
  return cls === 'polearm';
};

/**
 * 是否是长柄后排攻击能力场景（仅 polearm 的攻击技能）
 */
export const isPolearmBacklineAttack = (
  attacker: CombatUnit,
  ability: Ability | undefined,
  dist: number
): boolean => {
  if (!isPolearmWeapon(attacker)) return false;
  if (!ability || ability.type !== 'ATTACK') return false;
  return dist >= 1 && dist <= 2;
};

/**
 * 长柄在 1 格攻击时的命中惩罚：
 * - 默认 -15
 * - 拥有长兵精通（polearm_mastery）则取消惩罚
 */
export const getPolearmAdjacentHitPenalty = (
  attacker: CombatUnit,
  ability: Ability | undefined,
  dist: number
): number => {
  if (!isPolearmBacklineAttack(attacker, ability, dist)) return 0;
  if (dist !== 1) return 0;
  if (hasPerk(attacker, 'polearm_mastery')) return 0;
  return POLEARM_ADJACENT_HIT_PENALTY;
};
