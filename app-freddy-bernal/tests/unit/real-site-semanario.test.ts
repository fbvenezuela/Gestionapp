// The weekly as the official home shows it (scripts/real-site/semanario.ts), on an INVENTED home
// (tests/fixtures/real-site/home.html) and a PDF written here: the Drive file its cover links, its title when the file's
// name says nothing, the day the PDF was made. The Drive ids here only have the shape of one.
import { describe, expect, it } from 'vitest';
import {
  driveDownloadUrl, driveFileId, fileNameFromDisposition, findSemanario, meaningfulName, pdfCreationDay, pdfPageCount, semanarioTitle,
} from '../../scripts/real-site/semanario';
import { textPdf } from '@/lib/participation/pdf';
import { DEMO_DRIVE_ID, HOME_HTML, demoPdf } from '../fixtures/real-site/site';

describe('la sección «Semanario» de la portada', () => {
  it('su archivo de Drive y su portada (la de verdad, no la imagen de carga diferida); nada de la sección siguiente', () => {
    expect(findSemanario(HOME_HTML, 'https://sitio-oficial.test')).toEqual({
      driveId: DEMO_DRIVE_ID,
      cover: { src: 'https://sitio-oficial.test/wp-content/uploads/2026/09/portada-semanario.jpg', attachmentId: 7201, alt: '' },
    });
  });

  it('sin la sección, o sin enlace a Drive antes del título siguiente, no hay Semanario', () => {
    expect(findSemanario('<h2>Noticias (demo)</h2><a href="https://drive.google.com/file/d/ArchivoDePruebaDemo0009/view">x</a>', 'https://x.test')).toBeNull();
    expect(findSemanario('<h2>Semanario</h2><a href="https://sitio-oficial.test/pdf">x</a><h2>Otra (demo)</h2><a href="https://drive.google.com/file/d/ArchivoDePruebaDemo0009/view">y</a>', 'https://x.test')).toBeNull();
    expect(findSemanario('<h3> semanario </h3><p><a href="https://drive.google.com/open?id=ArchivoDePruebaDemo0009">ver</a></p>', 'https://x.test')).toEqual({ driveId: 'ArchivoDePruebaDemo0009', cover: null });
  });

  it('el id de un archivo de Drive en sus direcciones; nunca de otro sitio', () => {
    expect(driveFileId('https://drive.google.com/file/d/ArchivoDePruebaDemo0001/view?usp=sharing')).toBe('ArchivoDePruebaDemo0001');
    expect(driveFileId('https://drive.google.com/uc?export=download&id=ArchivoDePruebaDemo0001')).toBe('ArchivoDePruebaDemo0001');
    expect(driveFileId('https://drive.google.com/open?id=ArchivoDePruebaDemo0001')).toBe('ArchivoDePruebaDemo0001');
    expect(driveFileId('http://drive.google.com/file/d/ArchivoDePruebaDemo0001/view')).toBeNull();
    expect(driveFileId('https://drive.google.com.otro.test/file/d/ArchivoDePruebaDemo0001/view')).toBeNull();
    expect(driveFileId('https://drive.google.com/drive/folders/ArchivoDePruebaDemo0001')).toBeNull();
    expect(driveDownloadUrl('ArchivoDePruebaDemo0001')).toBe('https://drive.google.com/uc?export=download&id=ArchivoDePruebaDemo0001');
  });
});

describe('su título y su día', () => {
  it('el nombre del archivo o el título de su página si dicen algo; si no, el nombre configurado', () => {
    expect(fileNameFromDisposition('attachment; filename="1_0000000000000000001.pdf"')).toBe('1_0000000000000000001.pdf');
    expect(fileNameFromDisposition("attachment; filename*=UTF-8''Semanario%20de%20prueba%20N%C2%B0%2012.pdf")).toBe('Semanario de prueba N° 12.pdf');
    expect(fileNameFromDisposition(null)).toBeNull();
    expect(meaningfulName('1_0000000000000000001.pdf')).toBeNull();
    expect(meaningfulName('1_0000000000000000001.pdf - Google Drive')).toBeNull();
    expect(meaningfulName('Semanario_de_prueba_N°_12.pdf')).toBe('Semanario de prueba N° 12');
    expect(semanarioTitle({ fileName: '1_0000.pdf', pageTitle: '1_0000.pdf - Google Drive', fallback: 'Semanario de prueba (demo)' })).toBe('Semanario de prueba (demo)');
    expect(semanarioTitle({ fileName: null, pageTitle: 'Semanario de prueba N° 13 - Google Drive', fallback: 'x' })).toBe('Semanario de prueba N° 13');
  });

  it('el día en que se hizo el PDF y sus páginas, de sus propios datos', () => {
    const pdf = demoPdf();
    expect(pdfCreationDay(pdf)).toBe('2026-10-08');
    expect(pdfPageCount(pdf)).toBe(1);
    const long = textPdf(Array.from({ length: 200 }, (_, i) => ({ text: `Línea inventada ${i} (demo)` })), { title: 'Largo (demo)', createdAt: new Date(Date.UTC(2026, 0, 2)) });
    expect(pdfPageCount(long)).toBeGreaterThan(1);
    expect(pdfCreationDay(long)).toBe('2026-01-02');
    expect(pdfCreationDay(new TextEncoder().encode('%PDF-1.4 sin datos (demo)'))).toBeNull();
    expect(pdfCreationDay(new TextEncoder().encode('%PDF-1.4 /CreationDate (D:20261399000000Z)'))).toBeNull();
  });
});
