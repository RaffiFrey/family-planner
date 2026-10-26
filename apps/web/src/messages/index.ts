import { type Locale, resources } from '@fp/i18n';
import { app } from './app';
import { calendar } from './calendar';
import { files } from './files';
import { finance } from './finance';
import { lists } from './lists';
import { settings } from './settings';
import { tasks } from './tasks';
import { modules } from './modules';
import { financePlus } from './finance-plus';
import { meals } from './meals';
import { rewards } from './rewards';
import { pinboard } from './pinboard';
import { travel } from './travel';
import { photos } from './photos';
import { vault } from './vault';
import { contacts } from './contacts';
import { health } from './health';
import { school } from './school';
import { homeAssets } from './home-assets';
import { location } from './location';
import { assistant } from './assistant';
import { integrations } from './integrations';

type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };

/** The shared package uses `{{var}}` placeholders; next-intl expects ICU `{var}`. */
function toIcu<T>(node: T): DeepStrings<T> {
  if (typeof node === 'string') return node.replace(/\{\{(\w+)\}\}/g, '{$1}') as DeepStrings<T>;
  return Object.fromEntries(
    Object.entries(node as object).map(([k, v]) => [k, toIcu(v)]),
  ) as DeepStrings<T>;
}

function build(locale: Locale) {
  return {
    ...toIcu(resources[locale]),
    ...app[locale],
    calendar: calendar[locale],
    tasks: tasks[locale],
    lists: lists[locale],
    finance: finance[locale],
    files: files[locale],
    settings: settings[locale],
    modules: modules[locale],
    financePlus: financePlus[locale],
    meals: meals[locale],
    rewards: rewards[locale],
    pinboard: pinboard[locale],
    travel: travel[locale],
    photos: photos[locale],
    vault: vault[locale],
    contacts: contacts[locale],
    health: health[locale],
    school: school[locale],
    homeAssets: homeAssets[locale],
    location: location[locale],
    assistant: assistant[locale],
    integrations: integrations[locale],
  };
}

export type AppMessages = ReturnType<typeof build>;

const cache = new Map<Locale, AppMessages>();

export function getMessages(locale: Locale): AppMessages {
  let m = cache.get(locale);
  if (!m) {
    m = build(locale);
    cache.set(locale, m);
  }
  return m;
}
