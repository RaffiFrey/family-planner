/** Strings shared by the extension modules (navigation groups, plan upsells, gates). */
const de = {
  forbidden: 'Für diesen Bereich hast du keine Berechtigung.',
  navGroups: {
    main: 'Start',
    daily: 'Alltag',
    family: 'Familie',
    household: 'Haushalt',
    more: 'Mehr',
  },
  upsell: {
    title: 'In deinem Tarif nicht enthalten',
    cta: 'Tarif upgraden',
    askOwner: 'Bitte die Inhaber:in des Haushalts, den Tarif zu upgraden.',
    features: {
      contracts: 'Verträge & Abos, Sparziele und geteilte Ausgaben gibt es ab Family Plus.',
      ocr: 'Texterkennung (OCR) für Dokumente gibt es ab Family Plus.',
      vault:
        'Der Dokumenten-Tresor für Ausweise, Versicherungen und Urkunden ist ab Family Plus verfügbar.',
      advanced_reports:
        'Erweiterte Auswertungen (Vermögensverlauf, Trends, Jahresvergleich, CSV-Export) gibt es ab Family Plus.',
      rewards: 'Belohnungen & Taschengeld sind ab Family Plus verfügbar.',
      bank_sync: 'Der automatische Kontoabgleich mit deiner Bank ist in Family Pro enthalten.',
      ai_assistant: 'Der KI-Assistent ist in Family Pro enthalten.',
    },
  },
};

const en: typeof de = {
  forbidden: 'You do not have permission for this area.',
  navGroups: {
    main: 'Start',
    daily: 'Everyday',
    family: 'Family',
    household: 'Household',
    more: 'More',
  },
  upsell: {
    title: 'Not included in your plan',
    cta: 'Upgrade plan',
    askOwner: 'Ask the household owner to upgrade the plan.',
    features: {
      contracts:
        'Contracts & subscriptions, savings goals and shared expenses are available from Family Plus.',
      ocr: 'Text recognition (OCR) for documents is available from Family Plus.',
      vault:
        'The document vault for IDs, insurance papers and certificates is available from Family Plus.',
      advanced_reports:
        'Advanced reports (net worth history, trends, year-over-year, CSV export) are available from Family Plus.',
      rewards: 'Rewards & pocket money are available from Family Plus.',
      bank_sync: 'Automatic bank sync is included in Family Pro.',
      ai_assistant: 'The AI assistant is included in Family Pro.',
    },
  },
};

export const modules = { de, en };
