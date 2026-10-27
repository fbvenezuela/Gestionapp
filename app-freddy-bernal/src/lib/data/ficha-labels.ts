import type { Tone } from '@/components/ui/chip';

// Values of the fichas (obra fichas and community reports) as the database stores them (English, CHECK lists in
// supabase/migrations/20261027001700_fichas.sql) and the plain Spanish words the screens show.
// tests/unit/ficha-labels.test.ts checks that every list here equals its CHECK in the database.

export const OBRA_STAGES = ['draft', 'to_schedule', 'scheduled', 'done', 'archived'] as const;
export type ObraStage = (typeof OBRA_STAGES)[number];
export const OBRA_STAGE: Record<ObraStage, { label: string; tone: Tone }> = {
  draft: { label: 'Borrador', tone: 'neutral' },
  to_schedule: { label: 'Por ponerle fecha', tone: 'warn' },
  scheduled: { label: 'Con fecha', tone: 'info' },
  done: { label: 'Visita realizada', tone: 'ok' },
  archived: { label: 'Archivada', tone: 'neutral' },
};

export const REPORT_STATUSES = ['planned', 'in_progress', 'finished', 'pending', 'suspended'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_STATUS: Record<ReportStatus, { label: string; tone: Tone }> = {
  planned: { label: 'Programado', tone: 'info' },
  in_progress: { label: 'En ejecución', tone: 'accent' },
  finished: { label: 'Finalizado', tone: 'ok' },
  pending: { label: 'Pendiente', tone: 'warn' },
  suspended: { label: 'Suspendido', tone: 'neutral' },
};

export const REPORT_TYPES = ['delivery', 'benefit', 'event', 'repair', 'outreach', 'request', 'incident', 'other'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const REPORT_TYPE: Record<ReportType, string> = {
  delivery: 'Entrega',
  benefit: 'Beneficio',
  event: 'Evento',
  repair: 'Reparación',
  outreach: 'Jornada',
  request: 'Solicitud',
  incident: 'Incidencia',
  other: 'Otro',
};

export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  high: { label: 'Alta', tone: 'danger' },
  medium: { label: 'Media', tone: 'warn' },
  low: { label: 'Baja', tone: 'neutral' },
};

// «No aplica» / «Por confirmar»: the field is stored empty and its name goes into `marks`.
export const MARKS = ['not_applicable', 'to_confirm'] as const;
export type Mark = (typeof MARKS)[number];
export const MARK: Record<Mark, { label: string; tone: Tone }> = {
  not_applicable: { label: 'No aplica', tone: 'neutral' },
  to_confirm: { label: 'Por confirmar', tone: 'warn' },
};

export const WORK_STATES = ['not_started', 'in_progress', 'stalled', 'finished'] as const;
export type WorkState = (typeof WORK_STATES)[number];
export const WORK_STATE: Record<WorkState, { label: string; tone: Tone }> = {
  not_started: { label: 'Por iniciar', tone: 'neutral' },
  in_progress: { label: 'En ejecución', tone: 'accent' },
  stalled: { label: 'Paralizada', tone: 'danger' },
  finished: { label: 'Culminada', tone: 'ok' },
};

export const FIGURES_KINDS = ['confirmed', 'estimated'] as const;
export type FiguresKind = (typeof FIGURES_KINDS)[number];
export const FIGURES_KIND: Record<FiguresKind, string> = {
  confirmed: 'Confirmadas',
  estimated: 'Estimadas',
};

export const REPORTER_ATTENDS_VALUES = ['yes', 'no', 'to_confirm'] as const;
export type ReporterAttends = (typeof REPORTER_ATTENDS_VALUES)[number];
export const REPORTER_ATTENDS: Record<ReporterAttends, string> = {
  yes: 'Sí',
  no: 'No',
  to_confirm: 'Por confirmar',
};

// '' = not answered yet.
export const CURRENCIES = ['VES', 'USD', 'EUR', 'COP', 'other'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const CURRENCY: Record<Currency, string> = {
  VES: 'Bolívares (Bs)',
  USD: 'Dólares (USD)',
  EUR: 'Euros (EUR)',
  COP: 'Pesos colombianos (COP)',
  other: 'Otra moneda',
};

export const FAB_GENERATED_BY_VALUES = ['template', 'manual'] as const;
export type FabGeneratedBy = (typeof FAB_GENERATED_BY_VALUES)[number];
export const FAB_GENERATED_BY: Record<FabGeneratedBy, string> = {
  template: 'Armado con la plantilla',
  manual: 'Escrito o cambiado a mano',
};

// One line of the ficha's history (ficha_updates.kind), as «<who> <label>».
export const FICHA_UPDATE_KINDS = ['created', 'status', 'update', 'contact', 'scheduled', 'done', 'note', 'deleted', 'restored'] as const;
export type FichaUpdateKind = (typeof FICHA_UPDATE_KINDS)[number];
export const FICHA_UPDATE_KIND: Record<FichaUpdateKind, string> = {
  created: 'creó la ficha',
  status: 'cambió el estado',
  update: 'actualizó datos',
  contact: 'actualizó los contactos',
  scheduled: 'le puso fecha a la visita',
  done: 'marcó la visita como realizada',
  note: 'escribió una nota',
  deleted: 'borró la ficha',
  restored: 'restauró la ficha',
};
