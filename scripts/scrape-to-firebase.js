import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { JWT } from 'google-auth-library';

// CONFIGS
const SPREADSHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';
const SHEET_NAME = 'Músicas'; // Aba única

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

async function extrairCifra(url) {
  if (!url || !url.includes('cifraclub.com.br')) return url || '';
  try {
    const proxy = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const res = await fetch(proxy);
    const html = await res.text();
    const $ = cheerio.load(html);
    const cifra = $('.cifra, .cifra-part, [class*="cifra"]').first().text()?.trim();
    return cifra?.replace(/\n{3,}/g, '\n\n') || url;
  } catch {
    return url;
  }
}

// 🔥 SHEETS API DIRETA (sem google-spreadsheet)
async function getMusicas(authToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}?key=${process.env.GOOGLE_API_KEY || 'AIzaSyDcj5ebPcBXw5Ev6SQHXzxToCGfINprj_A'}`;
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Accept': 'application/json'
    }
  });

  if (!res.ok) throw new Error(`Sheets API: ${res.status}`);
  const { values } = await res.json();
  
  // Pula header, pega [Música, Tom, Artista, ?, Data, Cifra]
  return values.slice(1).filter(row => row[0]?.trim());
}

async function main() {
  console.log('🎵 IMOSP SCRAPER v4 - Sheets API Nativa');
  
  // Firebase
  const app = initializeApp(FIREBASE_CONFIG);
  const db = getDatabase(app);

  // JWT para Sheets (sem bibliotecas externas)
  const jwt = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });

  const { access_token } = await jwt.authorize();
  console.log('🔑 Autenticado Google Sheets');

  // 🔥 BUSCA DADOS
  const musicas = await getMusicas(access_token);
  console.log('📊 Músicas:', musicas.length);

  let saved = 0;
  for (const [nome, tom, artista, vazio, data, urlCifra] of musicas) {
    if (!nome?.trim()) continue;

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

    saved++;
  }

  console.log(`🎉 ${saved} músicas salvas no Firebase!`);
}

main().catch(err => {
  console.error('💥 ERRO:', err.message);
  process.exit(1);
});
