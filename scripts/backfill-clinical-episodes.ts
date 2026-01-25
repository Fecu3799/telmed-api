import 'dotenv/config';
import {
  ClinicalEpisodeNoteKind,
  UserRole,
} from '@prisma/client';
import { createPrismaWithPgAdapter } from '../src/infra/prisma/prisma-adapter.factory';

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required`);
    process.exit(1);
  }
  return value;
}

type LegacyConsultationRow = {
  id: string;
  doctorUserId: string;
  patientUserId: string;
  summary: string | null;
  notes: string | null;
  closedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

async function main() {
  const { prisma, disconnect } = createPrismaWithPgAdapter(
    getEnv('DATABASE_URL'),
  );

  try {
    const legacyColumns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'consultations'
          AND column_name IN ('summary', 'notes')
      `,
    );

    const legacyColumnNames = new Set(
      legacyColumns.map((column) => column.column_name),
    );

    if (!legacyColumnNames.has('summary') && !legacyColumnNames.has('notes')) {
      console.log('Legacy consultation columns not found; skipping backfill.');
      return;
    }

    const legacyConsultations =
      await prisma.$queryRawUnsafe<LegacyConsultationRow[]>(
        `
          SELECT
            id,
            doctor_user_id AS "doctorUserId",
            patient_user_id AS "patientUserId",
            summary,
            notes,
            closed_at AS "closedAt",
            updated_at AS "updatedAt",
            created_at AS "createdAt"
          FROM consultations
          WHERE summary IS NOT NULL OR notes IS NOT NULL
        `,
      );

    if (legacyConsultations.length === 0) {
      console.log('No legacy consultation notes found; nothing to backfill.');
      return;
    }

    let createdFinals = 0;

    for (const row of legacyConsultations) {
      if (!row.doctorUserId || !row.patientUserId) {
        console.warn(`Skipping consultation ${row.id} (missing users).`);
        continue;
      }

      const episode = await prisma.clinicalEpisode.upsert({
        where: { consultationId: row.id },
        update: {},
        create: {
          consultationId: row.id,
          patientUserId: row.patientUserId,
          doctorUserId: row.doctorUserId,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      });

      const existingFinal = await prisma.clinicalEpisodeNote.findFirst({
        where: {
          episodeId: episode.id,
          kind: ClinicalEpisodeNoteKind.final,
          deletedAt: null,
        },
      });

      if (existingFinal) {
        continue;
      }

      const summaryText = (row.summary ?? '').trim();
      const notesText = row.notes ?? '';
      const title = summaryText.length > 0 ? summaryText : 'Consulta';
      const body = notesText.length > 0 ? notesText : summaryText;
      const createdAt = row.closedAt ?? row.updatedAt ?? row.createdAt;

      await prisma.clinicalEpisodeNote.create({
        data: {
          episodeId: episode.id,
          kind: ClinicalEpisodeNoteKind.final,
          title,
          body,
          createdByUserId: row.doctorUserId,
          createdByRole: UserRole.doctor,
          createdAt,
          updatedAt: createdAt,
        },
      });

      createdFinals += 1;
    }

    console.log(`Backfill complete. Final notes created: ${createdFinals}.`);
  } finally {
    await disconnect();
  }
}

main().catch((err) => {
  console.error('Backfill failed');
  console.error(err);
  process.exit(1);
});
