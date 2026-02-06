// COLE ISTO NOVAMENTE (versão FINAL sem aba "Letras")
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const SPREADSHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDcj5ebPcBXw5Ev6SQHXzxToCGfINprj_A",
  authDomain: "appmusicasimosp.firebaseapp.com",
  databaseURL: "https://appmusicasimosp-default-rtdb.firebaseio.com",
  projectId: "appmusicasimosp",
  storageBucket: "appmusicasimosp.appspot.com",
  messagingSenderId: "SEU_SENDER_ID_AQUI",
  appId: "SEU_APP_ID_AQUI"
};

function normalizarNome(nome) {
  if (!nome) return '';
  return nome.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

async function extrairCifra(url) {
  if (!url || !url.includes('cifraclub.com.br')) return url || '';
  try {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    let cifraText = $('.cifra').text() || $('.cifra-part').text() || $('[class*="cifra"]').first().text();
    if (cifraText) {
      return cifraText.trim().replace(/\n{3,}/g, '\n\n');
    }
    return url;
  } catch (err) {
    console.error(`Cifra falhou ${url}:`, err.message);
    return url;
  }
}

async function main() {
  console.log('🚀 Iniciando migração...');
  
  const app = initializeApp(FIREBASE_CONFIG);
  const db = getDatabase(app);

  const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  doc.axios.defaults.headers.common.Authorization = `Bearer ${await serviceAccountAuth.authorize().then(r => r.access_token)}`;
  
  await doc.loadInfo();
  console.log('📊 Planilha:', doc.title);

  // ❌ SEMPRE só aba "Músicas"
  const musicasSheet = doc.sheetsByTitle['Músicas'];
  if (!musicasSheet) throw new Error('❌ Aba "Músicas" não encontrada!');
  
  const musicasRows = await musicasSheet.getRows();
  console.log('🎵 Músicas:', musicasRows.length);

  let saved = 0;
  for (const row of musicasRows) {
    const nome = row.get('Música')?.trim();
    if (!nome) continue;

    const nomeNormalizado = normalizarNome(nome);
    const cifraLink = row.get('Cifra')?.trim() || '';
    
    // Letra placeholder (edite depois no Firebase)
    const letra = 'Letra não encontrada na planilha. Edite no Firebase Console.';

    const cifra = await extrairCifra(cifraLink);

    await set(ref(db, `musicas/${nomeNormalizado}`), {
      nomeOriginal: nome,
      letra,
      cifra,
      ultimaAtualizacao: new Date().toISOString()
    });

    saved++;
    console.log(`✅ ${saved}/${musicasRows.length}: ${nomeNormalizado}`);
  }

  console.log(`🎉 FINALIZADO! ${saved} músicas salvas.`);
}

main().catch(err => {
  console.error('❌ ERRO:', err.message);
  process.exit(1);
});
