import { configRules } from './config';
import { itemRules } from './items';
import { luaRules } from './lua';
import { manifestRules } from './manifest';
import type { Rule } from './types';

export const ALL_RULES: Rule[] = [...manifestRules, ...itemRules, ...configRules, ...luaRules];
