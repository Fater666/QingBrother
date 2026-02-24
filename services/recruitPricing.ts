import { GameDifficulty, Trait } from '../types.ts';
import { getRecruitMultiplierByDifficulty } from '../constants.ts';

const BASE_SALARY = 10;
const HIRE_COST_SALARY_FACTOR = 25;
const MIN_HIRE_COST = 10;

export const getRecruitDifficultyMultiplier = (difficulty: GameDifficulty): number => {
  return getRecruitMultiplierByDifficulty(difficulty);
};

export const calculateRecruitSalary = (salaryMult: number): number => {
  return Math.floor(BASE_SALARY * salaryMult);
};

export const calculateRecruitHireCost = (
  salaryMult: number,
  traits: string[],
  traitTemplates: Record<string, Trait>,
): { salary: number; hireCost: number } => {
  const salary = calculateRecruitSalary(salaryMult);
  const hireCostBase = salary * HIRE_COST_SALARY_FACTOR;
  const randomFactor = 0.8 + Math.random() * 0.4;
  let hireCost = Math.floor(hireCostBase * randomFactor);

  const traitPriceMod = traits.reduce((mod, traitId) => {
    const tmpl = traitTemplates[traitId];
    if (!tmpl) return mod;
    return mod + (tmpl.type === 'positive' ? 0.15 : -0.10);
  }, 1.0);

  hireCost = Math.floor(hireCost * traitPriceMod);
  hireCost = Math.max(MIN_HIRE_COST, hireCost);
  return { salary, hireCost };
};
