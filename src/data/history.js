import { CapacitorHttp } from '@capacitor/core';

const SOURCES = {
  ATP:
    'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main/atp',
  WTA:
    'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main/wta'
};

const memoryCache = new Map();

export function normalizeName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

async function requestText(url) {
  try {
    const response = await CapacitorHttp.get({
      url,
      headers: {
        Accept: 'text/plain,text/csv,*/*'
      }
    });

    if (
      response.status < 200 ||
      response.status >= 300
    ) {
      throw new Error(
        `Historical HTTP ${response.status}`
      );
    }

    if (typeof response.data === 'string') {
      return response.data;
    }

    throw new Error('Respuesta histórica inválida');

  } catch (nativeError) {
    const response = await fetch(url);

    if (!response.ok) {
      throw nativeError;
    }

    return response.text();
  }
}

function parseCsvLine(line) {
  const result = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (
        quoted &&
        line[i + 1] === '"'
      ) {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }

      continue;
    }

    if (
      char === ',' &&
      !quoted
    ) {
      result.push(value);
      value = '';
      continue;
    }

    value += char;
  }

  result.push(value);

  return result;
}

function parseCSV(text) {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .filter(line => line.trim());

  if (!lines.length) {
    return [];
  }

  const headers =
    parseCsvLine(lines[0]);

  const rows = [];

  for (
    let i = 1;
    i < lines.length;
    i++
  ) {
    const values =
      parseCsvLine(lines[i]);

    const row = {};

    for (
      let j = 0;
      j < headers.length;
      j++
    ) {
      row[headers[j]] =
        values[j] ?? '';
    }

    rows.push(row);
  }

  return rows;
}

function fileName(tour, year) {
  const prefix =
    tour === 'ATP'
      ? 'atp'
      : 'wta';

  return `${prefix}_matches_${year}.csv`;
}

async function loadYear(
  tour,
  year
) {
  const source =
    SOURCES[tour];

  if (!source) {
    throw new Error(
      `Tour no soportado: ${tour}`
    );
  }

  const url =
    `${source}/${fileName(tour, year)}`;

  const text =
    await requestText(url);

  return parseCSV(text);
}

export async function loadTourHistory(
  tour,
  years = [2025, 2026]
) {
  const upper =
    String(tour).toUpperCase();

  const key =
    `${upper}:${years.join('-')}`;

  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }

  const promise =
    Promise.all(
      years.map(
        year =>
          loadYear(
            upper,
            year
          )
      )
    ).then(
      groups =>
        groups.flat()
    );

  memoryCache.set(
    key,
    promise
  );

  return promise;
}
