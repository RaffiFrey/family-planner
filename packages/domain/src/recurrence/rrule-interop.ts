import * as rruleNs from 'rrule';

/**
 * rrule ships CommonJS for Node and ESM for bundlers without an `exports` map.
 * Node exposes the CJS module on `default`, bundlers expose named exports.
 */
type RRuleModule = typeof rruleNs;
const mod: RRuleModule = (rruleNs as unknown as { default?: RRuleModule }).default ?? rruleNs;

export const RRule = mod.RRule;
export type RRule = rruleNs.RRule;
export type RRuleOptions = rruleNs.Options;
