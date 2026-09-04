import { randomUUID } from 'node:crypto';
import { readJson, writeJsonAtomic } from './atomic-json.mjs';

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function normalizePersona(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Persona must be an object.');
  const id = String(raw.id || '').trim();
  const name = String(raw.name || '').trim();
  const systemPrompt = String(raw.systemPrompt || '').trim();
  if (!ID_PATTERN.test(id)) throw new Error('Persona id is invalid.');
  if (!name || name.length > 80) throw new Error('Persona name must contain 1-80 characters.');
  if (!systemPrompt || systemPrompt.length > 20_000) throw new Error('Persona prompt must contain 1-20000 characters.');
  return {
    id,
    name,
    description: String(raw.description || '').trim().slice(0, 300),
    systemPrompt,
  };
}

export function normalizePersonasDocument(value) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.personas)) throw new Error('personas.json is invalid.');
  const ids = new Set();
  const personas = value.personas.map((entry) => {
    const persona = normalizePersona(entry);
    if (ids.has(persona.id)) throw new Error(`Duplicate persona id: ${persona.id}`);
    ids.add(persona.id);
    return persona;
  });
  return { schemaVersion: 1, personas };
}

export async function loadPersonas(path, defaults) {
  const document = await readJson(path, defaults);
  return normalizePersonasDocument(document);
}

export async function createPersona(path, document, input) {
  const requested = String(input?.id || '').trim().toLowerCase();
  const persona = normalizePersona({ ...input, id: requested || `persona-${randomUUID().slice(0, 8)}` });
  if (document.personas.some((entry) => entry.id === persona.id)) throw new Error('Persona id already exists.');
  const next = { schemaVersion: 1, personas: [...document.personas, persona] };
  await writeJsonAtomic(path, next);
  return { document: next, persona };
}

export async function updatePersona(path, document, id, input) {
  const index = document.personas.findIndex((entry) => entry.id === id);
  if (index < 0) return null;
  const persona = normalizePersona({ ...document.personas[index], ...input, id });
  const personas = [...document.personas];
  personas[index] = persona;
  const next = { schemaVersion: 1, personas };
  await writeJsonAtomic(path, next);
  return { document: next, persona };
}

export async function deletePersona(path, document, id) {
  if (id === 'default') throw new Error('The default persona cannot be deleted.');
  if (!document.personas.some((entry) => entry.id === id)) return null;
  const next = { schemaVersion: 1, personas: document.personas.filter((entry) => entry.id !== id) };
  await writeJsonAtomic(path, next);
  return next;
}
