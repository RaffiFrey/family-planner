import { Injectable } from '@nestjs/common';
import {
  type GermanState,
  parseFerienApi,
  parseOpenHolidays,
  type SchoolHoliday,
} from '@fp/domain/care';

const TIMEOUT_MS = 8000;

/**
 * Fetches German school holidays from public APIs: OpenHolidays (EU-funded, primary) with
 * ferien-api.de as fallback. Results are cached per state and year by the SchoolService.
 */
@Injectable()
export class HolidayFetcher {
  private async getJson(url: string): Promise<unknown> {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'family-planer/1.0' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${url} answered ${String(res.status)}`);
    return res.json();
  }

  async fetch(
    state: GermanState,
    year: number,
  ): Promise<{ holidays: SchoolHoliday[]; source: string }> {
    const y = String(year);
    try {
      const url =
        `https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&subdivisionCode=DE-${state}` +
        `&languageIsoCode=DE&validFrom=${y}-01-01&validTo=${y}-12-31`;
      return { holidays: parseOpenHolidays(await this.getJson(url)), source: 'openholidays' };
    } catch (primary) {
      try {
        const json = await this.getJson(`https://ferien-api.de/api/v1/holidays/${state}/${y}`);
        return { holidays: parseFerienApi(json), source: 'ferien-api' };
      } catch {
        throw primary instanceof Error ? primary : new Error(String(primary));
      }
    }
  }
}
