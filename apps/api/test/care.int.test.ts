import { createDb } from '@fp/db';
import {
  addFloating,
  floatingToLocalDate,
  localDateToFloating,
  toLocalDate,
} from '@fp/domain/time';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectStorage } from '../src/infra/storage.service.js';
import { BillingService } from '../src/modules/billing/billing.service.js';
import { HealthService } from '../src/modules/care/health/health.service.js';
import { HomeService } from '../src/modules/care/home/home.service.js';
import { LocationService } from '../src/modules/care/location/location.service.js';
import { HolidayFetcher } from '../src/modules/care/school/holiday-fetcher.js';
import { OcrEngine } from '../src/modules/care/vault/ocr-engine.js';
import { minimalPdf } from '../src/modules/care/vault/pdf-text.js';
import { VaultService } from '../src/modules/care/vault/vault.service.js';
import { type Stack, startStack, TestClient } from './harness.js';

let stack: Stack;
let anna: TestClient; // owner
let ben: TestClient; // adult
let tina: TestClient; // teen
let kim: TestClient; // child with login
let carla: TestClient; // caregiver (contacts + health)
let mallory: TestClient; // other household
let hh: string;
let malloryHh: string;
const m = {} as Record<'anna' | 'ben' | 'tina' | 'kim' | 'carla' | 'lena', string>;

const base = () => `/v1/households/${hh}`;
const today = () => toLocalDate(new Date(), 'Europe/Berlin');
const addDays = (date: string, n: number) =>
  floatingToLocalDate(addFloating(localDateToFloating(date), n, 'day'));
const addMonths = (date: string, n: number) =>
  floatingToLocalDate(addFloating(localDateToFloating(date), n, 'month'));

async function join(client: TestClient, name: string, body: Record<string, unknown>) {
  const inv = await anna.post(`${base()}/invitations`, body);
  expect(inv.status).toBe(201);
  const res = await client.post(`/v1/invitations/${inv.body.token}/accept`, { displayName: name });
  expect(res.status).toBe(201);
  return res.body.me.id as string;
}

async function notificationTypes(client: TestClient): Promise<string[]> {
  const res = await client.get('/v1/notifications?limit=200');
  expect(res.status).toBe(200);
  return res.body.items.map((n: { type: string }) => n.type);
}

async function ownerQuery<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const owner = createDb(stack.ownerUrl, { max: 1 });
  try {
    return (await owner.db.execute(query)).rows as T[];
  } finally {
    await owner.close();
  }
}

beforeAll(async () => {
  stack = await startStack({ OCR_ENABLED: 'false' });
  const c = () => new TestClient(stack.app);
  anna = await c().signUp('anna@care.test', 'Anna');
  ben = await c().signUp('ben@care.test', 'Ben');
  tina = await c().signUp('tina@care.test', 'Tina');
  kim = await c().signUp('kim@care.test', 'Kim');
  carla = await c().signUp('carla@care.test', 'Carla');
  mallory = await c().signUp('mallory@care.test', 'Mallory');
  const created = await anna.post('/v1/households', { name: 'Familie Frey', displayName: 'Anna' });
  hh = created.body.household.id;
  m.anna = created.body.me.id;
  m.ben = await join(ben, 'Ben', { role: 'adult' });
  m.tina = await join(tina, 'Tina', { role: 'teen' });
  m.kim = await join(kim, 'Kim', { role: 'child' });
  m.carla = await join(carla, 'Carla', {
    role: 'caregiver',
    grantedModules: ['contacts', 'health'],
  });
  // Managed baby profile whose U4 window opened three days ago.
  const babyBirthday = addDays(addMonths(today(), -2), -3);
  const baby = await anna.post(`${base()}/members`, {
    displayName: 'Lena',
    role: 'child',
    birthday: babyBirthday,
  });
  expect(baby.status).toBe(201);
  m.lena = baby.body.id ?? baby.body.member?.id;
  // Medication and geofence notifications default to push only; opt in to in-app.
  for (const client of [anna, ben]) {
    const prefs = await client.put('/v1/notifications/preferences', {
      channels: {
        'health.medication': ['in_app'],
        'location.arrived': ['in_app'],
        'location.left': ['in_app'],
      },
      digest: 'off',
      digestHour: 7,
      quietHours: null,
    });
    expect(prefs.status).toBe(200);
  }
  const other = await mallory.post('/v1/households', { name: 'Andere', displayName: 'Mallory' });
  malloryHh = other.body.household.id;
});

afterAll(async () => {
  await stack.close();
});

describe('documents vault', () => {
  let passportId: string;

  it('is a paid feature', async () => {
    const list = await anna.get(`${base()}/vault/documents`);
    expect(list.status).toBe(402);
    expect(list.body.code).toBe('plan_limit');
    const create = await anna.post(`${base()}/vault/documents`, { type: 'passport', title: 'x' });
    expect(create.status).toBe(402);
    await stack.app
      .get(BillingService)
      .applyPlan(hh, { plan: 'plus', status: 'active', provider: 'comp' });
    expect((await anna.get(`${base()}/vault/documents`)).status).toBe(200);
  });

  it('stores document numbers encrypted and returns them only on the detail endpoint', async () => {
    const res = await anna.post(`${base()}/vault/documents`, {
      type: 'passport',
      title: 'Reisepass Anna',
      holderMemberId: m.anna,
      issuer: 'Stadt München',
      documentNumber: 'C01X00T47',
      expiresOn: addDays(today(), 20),
      tags: ['reise'],
    });
    expect(res.status).toBe(201);
    passportId = res.body.id;
    expect(res.body).toMatchObject({
      documentNumber: 'C01X00T47',
      documentNumberLast4: '0T47',
      expiryState: 'expiring',
      ocrStatus: 'none',
      reminderLeadDays: [183, 30, 7],
    });
    const list = await anna.get(`${base()}/vault/documents?holderMemberId=${m.anna}`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].documentNumber).toBeNull();
    expect((await anna.get(`${base()}/vault/documents?type=id_card`)).body).toHaveLength(0);
    expect((await anna.get(`${base()}/vault/documents?tag=reise`)).body).toHaveLength(1);
    const detail = await ben.get(`${base()}/vault/documents/${passportId}`);
    expect(detail.body.documentNumber).toBe('C01X00T47');

    const rows = await ownerQuery<{ number_encrypted: string; number_last4: string }>(
      sql`select number_encrypted, number_last4 from vault_documents where id = ${passportId}`,
    );
    expect(rows[0]?.number_encrypted).toMatch(/^v1:/);
    expect(rows[0]?.number_encrypted).not.toContain('C01X00T47');
  });

  it('denies teens, children and caregivers', async () => {
    for (const client of [tina, kim, carla]) {
      expect((await client.get(`${base()}/vault/documents`)).status).toBe(403);
      expect((await client.get(`${base()}/vault/documents/${passportId}`)).status).toBe(403);
    }
  });

  it('hides private documents from other adults', async () => {
    const priv = await ben.post(`${base()}/vault/documents`, {
      type: 'medical',
      title: 'Befund',
      visibility: 'private',
    });
    expect(priv.status).toBe(201);
    expect((await anna.get(`${base()}/vault/documents/${priv.body.id}`)).status).toBe(404);
    const titles = (await anna.get(`${base()}/vault/documents`)).body.map(
      (d: { title: string }) => d.title,
    );
    expect(titles).not.toContain('Befund');
    expect((await anna.delete(`${base()}/vault/documents/${priv.body.id}`)).status).toBe(404);
  });

  it('lists expiring documents and searches full text with an ILIKE fallback', async () => {
    const expiring = await anna.get(`${base()}/vault/expiring?days=30`);
    expect(expiring.body.map((d: { id: string }) => d.id)).toContain(passportId);
    await anna.post(`${base()}/vault/documents`, {
      type: 'insurance_policy',
      title: 'Kfz-Versicherung',
      notes: 'Haftpflicht und Teilkasko bei der Allianz',
      expiresOn: addDays(today(), 400),
    });
    const hit = await anna.get(`${base()}/vault/search?q=haftpflicht`);
    expect(hit.status).toBe(200);
    expect(hit.body[0].document.title).toBe('Kfz-Versicherung');
    expect(hit.body[0].rank).toBeGreaterThan(0);
    expect(hit.body[0].snippet).toContain('Haftpflicht');
    const partial = await anna.get(`${base()}/vault/search?q=ftpfli`);
    expect(partial.body.map((h: { document: { title: string } }) => h.document.title)).toEqual([
      'Kfz-Versicherung',
    ]);
    expect((await anna.get(`${base()}/vault/search?q=nirgendwo`)).body).toEqual([]);
  });

  it('runs the OCR pipeline and suggests fields without overwriting them', async () => {
    const fileId = uuidv7();
    await ownerQuery(sql`insert into files (id, household_id, name, size_bytes, mime_type, storage_key, status, visibility, owner_member_id)
      values (${fileId}, ${hh}, 'ausweis.png', 1000, 'image/png', ${`${hh}/${fileId}`}, 'ready', 'household', ${m.anna})`);
    const doc = await anna.post(`${base()}/vault/documents`, {
      type: 'id_card',
      title: 'Personalausweis',
      fileIds: [fileId],
    });
    expect(doc.status).toBe(201);
    // OCR_ENABLED=false in tests.
    expect(doc.body.ocrStatus).toBe('disabled');
    const rerun = await anna.post(`${base()}/vault/documents/${doc.body.id}/ocr`);
    expect(rerun.status).toBe(202);
    expect(rerun.body.ocrStatus).toBe('disabled');

    // Simulate the worker with stubbed storage and recognizer.
    await ownerQuery(
      sql`update vault_documents set ocr_status = 'pending' where id = ${doc.body.id}`,
    );
    const storage = stack.app.get(ObjectStorage);
    const engine = stack.app.get(OcrEngine);
    const origGet = storage.getBuffer.bind(storage);
    const origRecognize = engine.recognize.bind(engine);
    storage.getBuffer = () => Promise.resolve(Buffer.from('png'));
    engine.recognize = () =>
      Promise.resolve(
        [
          'BUNDESREPUBLIK DEUTSCHLAND PERSONALAUSWEIS',
          'IDD<<T220001293<<<<<<<<<<<<<<<',
          '6408125F3103153D<<<<<<<<<<<<<8',
          'MUSTERMANN<<ERIKA<<<<<<<<<<<<<',
        ].join('\n'),
      );
    try {
      await stack.app.get(VaultService).processOcr(doc.body.id);
    } finally {
      storage.getBuffer = origGet;
      engine.recognize = origRecognize;
    }
    const after = await anna.get(`${base()}/vault/documents/${doc.body.id}`);
    expect(after.body.ocrStatus).toBe('done');
    expect(after.body.expiresOn).toBeNull();
    expect(after.body.suggestions.expiresAt[0]).toMatchObject({
      value: '2031-03-15',
      source: 'mrz',
    });
    expect(after.body.suggestions.documentNumber[0].value).toBe('T22000129');
    expect(after.body.suggestions.holderName).toBe('ERIKA MUSTERMANN');
    const found = await anna.get(`${base()}/vault/search?q=mustermann`);
    expect(found.body[0].document.id).toBe(doc.body.id);
  });

  it('reads PDF text layers, OCRs scanned pages and rejects unreadable PDFs', async () => {
    const pdfs = new Map<string, Buffer>();
    const addPdf = async (name: string, pdf: Buffer) => {
      const fileId = uuidv7();
      const key = `${hh}/${fileId}`;
      pdfs.set(key, pdf);
      await ownerQuery(sql`insert into files (id, household_id, name, size_bytes, mime_type, storage_key, status, visibility, owner_member_id)
        values (${fileId}, ${hh}, ${name}, 1000, 'application/pdf', ${key}, 'ready', 'household', ${m.anna})`);
      const doc = await anna.post(`${base()}/vault/documents`, {
        type: 'insurance_policy',
        title: name,
        fileIds: [fileId],
      });
      await ownerQuery(
        sql`update vault_documents set ocr_status = 'pending' where id = ${doc.body.id}`,
      );
      return doc.body.id as string;
    };
    const policy = await addPdf(
      'Hausrat.pdf',
      minimalPdf([
        'Hausratversicherung Musterversicherung AG',
        'Versicherungsschein-Nummer: HR-2024/778899',
        'Vertragsende 30.09.2029',
      ]),
    );
    // A "scan": only graphics, no text layer.
    const scanned = await addPdf('Scan.pdf', minimalPdf([], '0 0 0 rg 100 600 200 50 re f'));
    const broken = await addPdf('Kaputt.pdf', Buffer.from('%PDF-1.4 not really a pdf'));
    const engine = stack.app.get(OcrEngine);
    const origRecognize = engine.recognize.bind(engine);
    const recognized: Buffer[] = [];
    engine.recognize = (image: Buffer) => {
      recognized.push(image);
      return Promise.resolve('Ausweis gültig bis 15.08.2031');
    };
    const storage = stack.app.get(ObjectStorage);
    const origGet = storage.getBuffer.bind(storage);
    storage.getBuffer = (key: string) => {
      const pdf = pdfs.get(key);
      return pdf ? Promise.resolve(pdf) : Promise.reject(new Error('missing'));
    };
    try {
      await stack.app.get(VaultService).processOcr(policy);
      await stack.app.get(VaultService).processOcr(scanned);
      await stack.app.get(VaultService).processOcr(broken);
    } finally {
      storage.getBuffer = origGet;
      engine.recognize = origRecognize;
    }
    // Only the scanned page went through the recognizer, as a rendered PNG.
    expect(recognized).toHaveLength(1);
    expect(recognized[0]?.subarray(1, 4).toString('latin1')).toBe('PNG');
    const doc = await anna.get(`${base()}/vault/documents/${policy}`);
    expect(doc.body.ocrStatus).toBe('done');
    expect(doc.body.suggestions.expiresAt[0]).toMatchObject({
      value: '2029-09-30',
      source: 'keyword',
    });
    expect(doc.body.suggestions.documentNumber[0].value).toBe('HR-2024/778899');
    const found = await anna.get(`${base()}/vault/search?q=hausratversicherung`);
    expect(found.body.map((h: { document: { id: string } }) => h.document.id)).toEqual([policy]);
    const scan = await anna.get(`${base()}/vault/documents/${scanned}`);
    expect(scan.body.ocrStatus).toBe('done');
    expect(scan.body.suggestions.expiresAt[0]).toMatchObject({ value: '2031-08-15' });
    expect((await anna.get(`${base()}/vault/documents/${broken}`)).body.ocrStatus).toBe(
      'unsupported',
    );
    const bad = await anna.post(`${base()}/vault/documents`, {
      type: 'contract',
      title: 'x',
      fileIds: [uuidv7()],
    });
    expect(bad.status).toBe(400);
  });

  it('sends expiry reminders once', async () => {
    const vault = stack.app.get(VaultService);
    expect(await vault.expiryReminders()).toBeGreaterThanOrEqual(1);
    expect(await vault.expiryReminders()).toBe(0);
    expect(await notificationTypes(anna)).toContain('vault.document_expiring');
  });

  it('recognizes text in a real image with tesseract (skipped offline)', async (ctx) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="160">
      <rect width="100%" height="100%" fill="white"/>
      <text x="30" y="100" font-family="Arial, sans-serif" font-size="56" fill="black">GUELTIG BIS 31.12.2030</text>
    </svg>`;
    let png: Buffer;
    try {
      png = await sharp(Buffer.from(svg)).png().toBuffer();
    } catch {
      ctx.skip();
      return;
    }
    let text: string;
    try {
      text = await Promise.race([
        stack.app.get(OcrEngine).recognize(png),
        new Promise<string>((_, reject) =>
          setTimeout(() => {
            reject(new Error('timeout'));
          }, 90_000),
        ),
      ]);
    } catch {
      ctx.skip(); // language data not downloadable (offline) or too slow
      return;
    }
    if (!text.trim()) {
      ctx.skip();
      return;
    }
    expect(text.toUpperCase()).toContain('2030');
  }, 180_000);
});

describe('contacts & emergency cards', () => {
  let doctor: string;
  let grandma: string;

  it('manages the address book with role checks', async () => {
    const d = await anna.post(`${base()}/contacts`, {
      name: 'Dr. Weber',
      category: 'doctor',
      organization: 'Kinderarztpraxis',
      phones: [{ label: 'Praxis', number: '+49 89 123456' }],
      memberIds: [m.lena],
    });
    expect(d.status).toBe(201);
    doctor = d.body.id;
    const g = await ben.post(`${base()}/contacts`, {
      name: 'Oma Hilde',
      category: 'family',
      phones: [{ number: '0171 2345678' }],
    });
    grandma = g.body.id;
    expect(g.body.phones[0].label).toBeNull();
    expect((await kim.get(`${base()}/contacts?category=doctor`)).body).toHaveLength(1);
    expect((await kim.get(`${base()}/contacts?memberId=${m.lena}`)).body).toHaveLength(1);
    expect((await kim.get(`${base()}/contacts?q=hild`)).body[0].name).toBe('Oma Hilde');
    expect((await kim.post(`${base()}/contacts`, { name: 'x' })).status).toBe(403);
    const upd = await tina.patch(`${base()}/contacts/${grandma}`, { email: 'hilde@example.com' });
    expect(upd.status).toBe(200);
    expect(
      (await anna.post(`${base()}/contacts`, { name: 'x', phones: [{ number: 'abc' }] })).status,
    ).toBe(422);
  });

  it('encrypts insurance numbers and reveals them only to permitted members', async () => {
    const card = await anna.put(`${base()}/emergency-cards/${m.lena}`, {
      bloodType: 'A+',
      allergies: ['Erdnüsse'],
      insuranceProvider: 'TK',
      insuranceNumber: 'A123456789',
      emergencyContactIds: [grandma],
      doctorContactId: doctor,
    });
    expect(card.status).toBe(200);
    expect(card.body).toMatchObject({
      insuranceNumber: 'A123456789',
      insuranceNumberLast4: '6789',
    });
    const rows = await ownerQuery<{ insurance_number_encrypted: string }>(
      sql`select insurance_number_encrypted from emergency_cards where member_id = ${m.lena}`,
    );
    expect(rows[0]?.insurance_number_encrypted).toMatch(/^v1:/);
    expect(rows[0]?.insurance_number_encrypted).not.toContain('123456789');

    const asCaregiver = await carla.get(`${base()}/emergency-cards/${m.lena}`);
    expect(asCaregiver.body.insuranceNumber).toBe('A123456789');
    const asChild = await kim.get(`${base()}/emergency-cards/${m.lena}`);
    expect(asChild.status).toBe(200);
    expect(asChild.body.insuranceNumber).toBeNull();
    expect(asChild.body.insuranceNumberLast4).toBe('6789');
    expect(asChild.body.allergies).toEqual(['Erdnüsse']);
    // Teens may edit only their own card.
    expect((await tina.put(`${base()}/emergency-cards/${m.lena}`, { notes: 'x' })).status).toBe(
      403,
    );
    const own = await tina.put(`${base()}/emergency-cards/${m.tina}`, {
      insuranceNumber: 'T999',
    });
    expect(own.status).toBe(200);
    expect((await anna.get(`${base()}/emergency-cards`)).body).toHaveLength(2);
    const bad = await anna.put(`${base()}/emergency-cards/${m.lena}`, {
      emergencyContactIds: [uuidv7()],
    });
    expect(bad.status).toBe(400);
  });

  it('serves an offline emergency summary', async () => {
    const s = await kim.get(`${base()}/emergency-cards/${m.lena}/summary`);
    expect(s.status).toBe(200);
    expect(s.body.member).toMatchObject({ id: m.lena, displayName: 'Lena' });
    expect(s.body.doctor.name).toBe('Dr. Weber');
    expect(s.body.emergencyContacts.map((c: { name: string }) => c.name)).toEqual(['Oma Hilde']);
    expect(s.body.maxAgeSeconds).toBe(86400);
    const again = await kim.get(`${base()}/emergency-cards/${m.lena}/summary`);
    expect(again.body.version).toBe(s.body.version);
    // Deleting a contact removes it from the card.
    expect((await anna.delete(`${base()}/contacts/${grandma}`)).status).toBe(200);
    const after = await anna.get(`${base()}/emergency-cards/${m.lena}/summary`);
    expect(after.body.emergencyContacts).toEqual([]);
    expect(after.body.version).not.toBe(s.body.version);
  });
});

describe('health', () => {
  it('records vaccinations with permissions per role', async () => {
    const v = await anna.post(`${base()}/health/vaccinations`, {
      memberId: m.lena,
      vaccine: '6-fach',
      givenOn: addDays(today(), -50),
      dose: '1/3',
      nextDueOn: addDays(today(), 10),
    });
    expect(v.status).toBe(201);
    expect((await carla.get(`${base()}/health/vaccinations?memberId=${m.lena}`)).body).toHaveLength(
      1,
    );
    expect(
      (
        await carla.post(`${base()}/health/vaccinations`, {
          memberId: m.lena,
          vaccine: 'x',
          givenOn: today(),
        })
      ).status,
    ).toBe(403);
    expect((await tina.get(`${base()}/health/vaccinations`)).status).toBe(200);
    expect(
      (await tina.patch(`${base()}/health/vaccinations/${v.body.id}`, { dose: '2' })).status,
    ).toBe(403);
    expect((await kim.get(`${base()}/health/vaccinations`)).status).toBe(403);
  });

  it('plans medication intakes and reminds once per occurrence', async () => {
    const med = await anna.post(`${base()}/health/medications`, {
      memberId: m.lena,
      name: 'Vitamin D',
      dose: '1 Tablette',
      times: ['20:00', '08:00'],
      startOn: today(),
      endOn: addDays(today(), 30),
    });
    expect(med.status).toBe(201);
    expect(med.body.times).toEqual(['08:00', '20:00']);
    expect(med.body.timezone).toBe('Europe/Berlin');
    expect(med.body.nextAt).not.toBeNull();
    const from = new Date(`${today()}T00:00:00Z`);
    const sched = await anna.get(
      `${base()}/health/medications/${med.body.id}/schedule?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(new Date(from.getTime() + 3 * 86_400_000).toISOString())}`,
    );
    expect(sched.status).toBe(200);
    expect(sched.body.length).toBeGreaterThanOrEqual(5);
    const at = new Date(sched.body[2].at as string);
    const health = stack.app.get(HealthService);
    expect(await health.medicationReminders(new Date(at.getTime() + 60_000))).toBe(1);
    expect(await health.medicationReminders(new Date(at.getTime() + 120_000))).toBe(0);
    const invalid = await anna.post(`${base()}/health/medications`, {
      memberId: m.lena,
      name: 'x',
      times: ['08:00'],
      rrule: 'FREQ=HOURLY',
      startOn: today(),
    });
    expect(invalid.status).toBe(400);
  });

  it('computes U-Untersuchungen and marks them done', async () => {
    const res = await carla.get(`${base()}/health/checkups/${m.lena}`);
    expect(res.status).toBe(200);
    const byCode = Object.fromEntries(
      res.body.checkups.map((c: { code: string; status: string }) => [c.code, c.status]),
    );
    expect(byCode).toMatchObject({ U1: 'missed', U4: 'due', U5: 'upcoming', J2: 'upcoming' });
    const none = await anna.get(`${base()}/health/checkups/${m.anna}`);
    expect(none.body.checkups).toEqual([]);
  });

  it('sends vaccination and check-up reminders idempotently', async () => {
    const health = stack.app.get(HealthService);
    expect(await health.healthReminders()).toBeGreaterThanOrEqual(2);
    expect(await health.healthReminders()).toBe(0);
    const types = await notificationTypes(anna);
    expect(types).toContain('health.vaccination_due');
    expect(types).toContain('health.checkup_due');
    expect(types).toContain('health.medication');

    const done = await anna.put(`${base()}/health/checkups/${m.lena}/U4`, { doneOn: today() });
    expect(done.status).toBe(200);
    expect(done.body.checkups.find((c: { code: string }) => c.code === 'U4')).toMatchObject({
      status: 'done',
      doneOn: today(),
    });
    const undo = await anna.delete(`${base()}/health/checkups/${m.lena}/U4`);
    expect(undo.body.checkups.find((c: { code: string }) => c.code === 'U4').status).toBe('due');
    expect(
      (await anna.put(`${base()}/health/checkups/${m.lena}/U99`, { doneOn: today() })).status,
    ).toBe(422);
  });
});

describe('kids & school', () => {
  let calls = 0;

  it('caches public school holidays per state and year', async () => {
    const fetcher = stack.app.get(HolidayFetcher);
    fetcher.fetch = (state, year) => {
      calls++;
      if (state === 'HH') return Promise.reject(new Error('offline'));
      return Promise.resolve({
        holidays: [
          { name: 'Herbstferien', start: `${String(year)}-11-02`, end: `${String(year)}-11-06` },
          {
            name: 'Weihnachtsferien',
            start: `${String(year)}-12-23`,
            end: `${String(year + 1)}-01-05`,
          },
        ],
        source: 'mock',
      });
    };
    expect((await anna.get(`${base()}/school/holidays?from=2026-10-01&to=2026-11-30`)).status).toBe(
      400,
    );
    const settings = await anna.put(`${base()}/school/settings`, {
      state: 'BY',
      abWeekAnchor: '2026-11-09',
    });
    expect(settings.body).toEqual({ state: 'BY', abWeekAnchor: '2026-11-09' });
    const res = await kim.get(`${base()}/school/holidays?from=2026-10-01&to=2026-11-30`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      state: 'BY',
      complete: true,
      holidays: [{ name: 'Herbstferien', start: '2026-11-02', end: '2026-11-06' }],
    });
    await anna.get(`${base()}/school/holidays?from=2026-11-01&to=2026-12-31`);
    expect(calls).toBe(1);
    const offline = await anna.get(
      `${base()}/school/holidays?from=2026-01-01&to=2026-12-31&state=HH`,
    );
    expect(offline.body).toEqual({ state: 'HH', complete: false, holidays: [] });
  });

  it('builds a day timetable with A/B weeks and holidays', async () => {
    const math = await anna.post(`${base()}/school/timetable`, {
      memberId: m.kim,
      weekday: 1,
      period: 1,
      startTime: '08:00',
      endTime: '08:45',
      subject: 'Mathe',
      room: '204',
    });
    expect(math.status).toBe(201);
    await anna.post(`${base()}/school/timetable`, {
      memberId: m.kim,
      weekday: 1,
      period: 2,
      startTime: '08:50',
      endTime: '09:35',
      subject: 'Kunst',
      week: 'B',
    });
    expect(
      (
        await anna.post(`${base()}/school/timetable`, {
          memberId: m.kim,
          weekday: 1,
          period: 3,
          startTime: '10:00',
          endTime: '09:00',
          subject: 'x',
        })
      ).status,
    ).toBe(422);
    expect((await kim.post(`${base()}/school/timetable`, { memberId: m.kim })).status).toBe(403);
    const holiday = await kim.get(`${base()}/school/timetable/${m.kim}/day/2026-11-02`);
    expect(holiday.body).toMatchObject({ holiday: 'Herbstferien', entries: [] });
    const aWeek = await kim.get(`${base()}/school/timetable/${m.kim}/day/2026-11-09`);
    expect(aWeek.body.week).toBe('A');
    expect(aWeek.body.entries.map((e: { subject: string }) => e.subject)).toEqual(['Mathe']);
    const bWeek = await kim.get(`${base()}/school/timetable/${m.kim}/day/2026-11-16`);
    expect(bWeek.body.entries.map((e: { subject: string }) => e.subject)).toEqual([
      'Mathe',
      'Kunst',
    ]);
    expect((await anna.get(`${base()}/school/timetable?memberId=${m.kim}`)).body).toHaveLength(2);
    expect(
      (await anna.patch(`${base()}/school/timetable/${math.body.id}`, { endTime: '07:00' })).status,
    ).toBe(400);
  });
});

describe('home & vehicles', () => {
  let car: string;

  it('tracks assets and expiring warranties', async () => {
    const res = await anna.post(`${base()}/home/assets`, {
      kind: 'vehicle',
      name: 'Familienauto',
      details: { plate: 'M-AB 123', model: 'Kombi' },
      warrantyUntil: addDays(today(), 30),
    });
    expect(res.status).toBe(201);
    car = res.body.id;
    expect(
      (await tina.get(`${base()}/home/warranties?days=60`)).body.map((a: { id: string }) => a.id),
    ).toEqual([car]);
    expect((await anna.get(`${base()}/home/warranties?days=10`)).body).toEqual([]);
    expect((await tina.post(`${base()}/home/assets`, { kind: 'home', name: 'x' })).status).toBe(
      403,
    );
    expect((await kim.get(`${base()}/home/assets`)).status).toBe(403);
  });

  it('schedules maintenance from templates and completes it', async () => {
    const templates = await anna.get(`${base()}/home/maintenance-templates`);
    expect(templates.body.map((t: { key: string }) => t.key)).toContain('hu');
    const hu = await anna.post(`${base()}/home/maintenance`, {
      assetId: car,
      templateKey: 'hu',
      nextDueOn: addDays(today(), 10),
    });
    expect(hu.status).toBe(201);
    expect(hu.body).toMatchObject({
      title: 'Hauptuntersuchung (HU/TÜV)',
      leadDays: 30,
      status: 'upcoming',
      recurrence: { mode: 'interval', months: 24 },
    });
    const tyres = await anna.post(`${base()}/home/maintenance`, {
      assetId: car,
      templateKey: 'tyre_change',
    });
    expect(tyres.body.nextDueOn).toMatch(/-(04|10)-01$/);
    expect(
      (await anna.post(`${base()}/home/maintenance`, { assetId: car, title: 'Ölwechsel' })).status,
    ).toBe(422);
    expect(
      (await anna.post(`${base()}/home/maintenance`, { assetId: car, templateKey: 'nope' })).status,
    ).toBe(400);

    const home = stack.app.get(HomeService);
    expect(await home.maintenanceReminders()).toBeGreaterThanOrEqual(1);
    expect(await home.maintenanceReminders()).toBe(0);
    expect(await notificationTypes(ben)).toContain('home.maintenance_due');

    const done = await anna.post(`${base()}/home/maintenance/${hu.body.id}/complete`, {
      doneOn: today(),
      costMinor: 14900,
    });
    expect(done.status).toBe(201);
    expect(done.body.plan.nextDueOn).toBe(addMonths(today(), 24));
    expect(done.body.plan.lastDoneOn).toBe(today());
    expect(done.body.log).toMatchObject({ costMinor: 14900, dueOn: addDays(today(), 10) });
    expect((await anna.get(`${base()}/home/maintenance/${hu.body.id}/logs`)).body).toHaveLength(1);
    expect((await anna.get(`${base()}/home/maintenance?assetId=${car}`)).body).toHaveLength(2);
  });

  it('records meter readings and computes consumption', async () => {
    const readings = [
      ['2026-01-01T00:00:00+01:00', '1000'],
      ['2026-02-01T00:00:00+01:00', '1310.5'],
      ['2026-03-01T00:00:00+01:00', '1590.5'],
    ] as const;
    for (const [readAt, value] of readings) {
      const r = await anna.post(`${base()}/home/assets/${car}/readings`, {
        meterType: 'mileage',
        value,
        unit: 'km',
        readAt,
      });
      expect(r.status).toBe(201);
    }
    expect(
      (
        await anna.post(`${base()}/home/assets/${car}/readings`, {
          meterType: 'gas',
          value: '1,5',
          unit: 'm3',
        })
      ).status,
    ).toBe(422);
    const stats = await anna.get(`${base()}/home/assets/${car}/consumption?meterType=mileage`);
    expect(stats.status).toBe(200);
    expect(stats.body).toMatchObject({ unit: 'km', total: '590.5', days: 59, avgPerDay: '10.008' });
    expect(
      stats.body.periods.map((p: { period: string; consumption: string }) => [
        p.period,
        p.consumption,
      ]),
    ).toEqual([
      ['2026-01', '310.5'],
      ['2026-02', '280'],
    ]);
    const list = await anna.get(`${base()}/home/assets/${car}/readings?meterType=mileage`);
    expect(list.body[0].value).toBe('1590.500');
  });
});

describe('location sharing', () => {
  let school: string;
  const atSchool = { lat: 50.0, lng: 8.0 };
  const far = { lat: 50.01, lng: 8.0 };

  it('requires opt-in before accepting pings', async () => {
    const res = await kim.post(`${base()}/location/pings`, { ...far, accuracyM: 10 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('location_not_shared');
    expect((await kim.get(`${base()}/location/share`)).body ?? null).toBeNull();
    const none = await kim.get(`${base()}/location/members`);
    expect(none.status).toBe(200);
    expect(none.body).toEqual([]);
  });

  it('manages places and subscriptions', async () => {
    expect((await kim.post(`${base()}/location/places`, { name: 'x', ...atSchool })).status).toBe(
      403,
    );
    const p = await anna.post(`${base()}/location/places`, {
      name: 'Schule',
      ...atSchool,
      radiusM: 150,
    });
    expect(p.status).toBe(201);
    school = p.body.id;
    const sub = await anna.post(`${base()}/location/places/${school}/subscriptions`, {});
    expect(sub.status).toBe(201);
    const again = await anna.post(`${base()}/location/places/${school}/subscriptions`, {});
    expect(again.body.id).toBe(sub.body.id);
    expect(
      (
        await ben.post(`${base()}/location/places/${school}/subscriptions`, {
          targetMemberId: m.kim,
        })
      ).status,
    ).toBe(201);
    expect((await kim.post(`${base()}/location/places/${school}/subscriptions`, {})).status).toBe(
      201,
    );
    expect((await anna.get(`${base()}/location/subscriptions`)).body).toHaveLength(1);
  });

  it('evaluates geofences and notifies subscribers', async () => {
    const share = await kim.put(`${base()}/location/share`, { durationMinutes: 60 });
    expect(share.status).toBe(200);
    expect(share.body).toMatchObject({ memberId: m.kim, active: true, sharedWith: null });
    const first = await kim.post(`${base()}/location/pings`, { ...far, accuracyM: 15 });
    expect(first.status).toBe(200);
    expect(first.body.events).toEqual([]);
    const arrive = await kim.post(`${base()}/location/pings`, { ...atSchool, accuracyM: 15 });
    expect(arrive.body.events).toEqual([
      { placeId: school, placeName: 'Schule', event: 'arrived' },
    ]);
    const stay = await kim.post(`${base()}/location/pings`, {
      lat: 50.0015,
      lng: 8.0,
      accuracyM: 15,
    });
    expect(stay.body.events).toEqual([]);

    const location = stack.app.get(LocationService);
    const notified = await location.handleGeofenceEvent({
      householdId: hh,
      memberId: m.kim,
      placeId: school,
      event: 'arrived',
    });
    expect(notified).toBe(2);
    expect(await notificationTypes(anna)).toContain('location.arrived');
    expect(await notificationTypes(ben)).toContain('location.arrived');

    const latest = await anna.get(`${base()}/location/members`);
    expect(latest.body).toHaveLength(1);
    expect(latest.body[0]).toMatchObject({ memberId: m.kim, placeIds: [school] });
    expect((await ben.get(`${base()}/location/members/${m.kim}/history`)).body).toHaveLength(3);
  });

  it('restricts visibility to selected members and deletes history on stop', async () => {
    await kim.put(`${base()}/location/share`, { durationMinutes: 30, sharedWith: [m.anna] });
    expect((await anna.get(`${base()}/location/members`)).body).toHaveLength(1);
    expect((await ben.get(`${base()}/location/members`)).body).toEqual([]);
    expect((await ben.get(`${base()}/location/members/${m.kim}/history`)).status).toBe(404);
    const left = await kim.post(`${base()}/location/pings`, { ...far, accuracyM: 10 });
    expect(left.body.events).toEqual([{ placeId: school, placeName: 'Schule', event: 'left' }]);
    // Ben subscribed but is no longer shared with.
    expect(
      await stack.app.get(LocationService).handleGeofenceEvent({
        householdId: hh,
        memberId: m.kim,
        placeId: school,
        event: 'left',
      }),
    ).toBe(1);

    expect((await kim.delete(`${base()}/location/share`)).status).toBe(200);
    expect((await anna.get(`${base()}/location/members`)).body).toEqual([]);
    const rows = await ownerQuery<{ n: number }>(
      sql`select count(*)::int as n from location_pings where member_id = ${m.kim}`,
    );
    expect(rows[0]?.n).toBe(0);
    expect((await kim.post(`${base()}/location/pings`, { ...far, accuracyM: 10 })).status).toBe(
      409,
    );
  });

  it('keeps only the latest fix and 24 h of history', async () => {
    await anna.put(`${base()}/location/share`, { durationMinutes: 120 });
    await anna.post(`${base()}/location/pings`, { ...far, accuracyM: 10 });
    // Children only see locations shared with them explicitly.
    expect((await kim.get(`${base()}/location/members`)).body).toEqual([]);
    expect((await ben.get(`${base()}/location/members`)).body).toHaveLength(1);
    await anna.put(`${base()}/location/share`, { durationMinutes: 120, sharedWith: [m.kim] });
    expect((await kim.get(`${base()}/location/members`)).body[0].memberId).toBe(m.anna);
    const old = new Date(Date.now() - 30 * 3600_000);
    await ownerQuery(sql`insert into location_pings (id, household_id, member_id, lat, lng, accuracy_m, at)
      values (${uuidv7()}, ${hh}, ${m.anna}, 1, 1, 10, ${old})`);
    await stack.app.get(LocationService).retention();
    const rows = await ownerQuery<{ n: number }>(
      sql`select count(*)::int as n from location_pings where member_id = ${m.anna}`,
    );
    expect(rows[0]?.n).toBe(1);
    // Expired shares end and their fixes are deleted.
    await ownerQuery(
      sql`update location_shares set until = now() - interval '1 minute' where member_id = ${m.anna}`,
    );
    await stack.app.get(LocationService).retention();
    expect((await anna.get(`${base()}/location/share`)).body.active).toBe(false);
    const after = await ownerQuery<{ n: number }>(
      sql`select count(*)::int as n from location_pings where member_id = ${m.anna}`,
    );
    expect(after[0]?.n).toBe(0);
  });
});

describe('tenant isolation', () => {
  it('hides care data from other households', async () => {
    for (const path of [
      '/vault/documents',
      '/contacts',
      '/emergency-cards',
      '/health/vaccinations',
      '/school/timetable',
      '/home/assets',
      '/location/places',
    ]) {
      expect((await mallory.get(`${base()}${path}`)).status).toBe(404);
    }
    const own = `/v1/households/${malloryHh}`;
    expect((await mallory.get(`${own}/contacts`)).body).toEqual([]);
    expect((await mallory.get(`${own}/home/assets`)).body).toEqual([]);
    expect((await mallory.get(`${own}/emergency-cards`)).body).toEqual([]);
    expect((await mallory.get(`${own}/health/checkups/${m.lena}`)).status).toBe(404);
    expect((await mallory.get(`${own}/location/places`)).body).toEqual([]);
  });
});
