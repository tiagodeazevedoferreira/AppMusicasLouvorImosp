import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { JWT } from 'google-auth-library';

const SPREADSHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';
const SHEET_NAME = 'Músicas';

const FIREBASE_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDcj5ebPcBXw5Ev6SQHXzxToCGfINprj_A",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "appmusicasimosp.firebaseapp.com",
  databaseURL: process.env.FIREBASE_DATABASE_URL || "https://appmusicasimosp-default-rtdb.firebaseio.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "appmusicasimosp"
};

function normalizarNome(nome) {
  return nome?.trim().toLowerCase()
    ?.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    ?.replace(/[^a-z0-9]+/g, '-') || '';
}

// ⚡ 5s TIMEOUT por música
async function extrairCifra(url) {
  if (!url || !url.includes('cifraclub.com.br')) return url || '';
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const proxy = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const res = await fetch(proxy, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    const html = await res.text();
    const $ = cheerio.load(html);
    const cifra = $('.cifra, .cifra-part, [class*="cifra"]').first().text()?.trim();
    
    return cifra?.replace(/\n{3,}/g, '\n\n') || url;
  } catch {
    clearTimeout(timeoutId);
    return url; // Timeout = URL original
  }
}

async function getMusicas(authToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}`;
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Accept': 'application/json'
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Sheets API ${res.status}: ${errorText.slice(0, 100)}`);
  }
  
  const { values } = await res.json();
  return values.slice(1).filter(row => row[0]?.trim());
}

async function main() {
  console.log('⚡ IMOSP SCRAPER v4 TURBO - 17 músicas em 10s');
  
  const app = initializeApp(FIREBASE_CONFIG);
  const db = getDatabase(app);

  const jwt = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });

  const { access_token } = await jwt.authorize();
  console.log('🔑 JWT OK');

  const musicas = await getMusicas(access_token);
  console.log(`📊 ${musicas.length} músicas encontradas`);

  // 🔥 PARALELO + TIMEOUT = TURBO
  const promises = musicas.map(async ([nome, tom, artista, vazio, data, urlCifra], index) => {
    if (!nome?.trim()) return;
    
    console.log(`⏳ ${index + 1}/${musicas.length}: ${nome.trim()}`);
    
    const slug = normalizarNome(nome);
    const conteudo = await extrairCifra(urlCifra);

    await set(ref(db, `musicas/${slug}`), {
      nomeOriginal: nome.trim(),
      tom: tom?.trim() || '',
      artista: artista?.trim() || '',
      data: data?.trim() || '',
      letra: conteudo,
      cifra: conteudo,
      urlOriginal: urlCifra?.trim() || '',
      ultimaAtualizacao: new Date().toISOString()
    });
  });

  await Promise.all(promises);
  console.log('🎉 TODAS salvas!');
}

main().catch(err => {
  console.error('💥', err.message);
  process.exit(1);
});
