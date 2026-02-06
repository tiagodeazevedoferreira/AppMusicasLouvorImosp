import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// CONFIGS (com process.env)
const SPREADSHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';

const FIREBASE_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDcj5ebPcBXw5Ev6SQHXzxToCGfINprj_A",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "appmusicasimosp.firebaseapp.com",
  databaseURL: process.env.FIREBASE_DATABASE_URL || "https://appmusicasimosp-default-rtdb.firebaseio.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "appmusicasimosp",
  storageBucket: process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.appspot.com` : "appmusicasimosp.appspot.com"
};

function normalizarNome(nome) {
  if (!nome) return '';
  return nome.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

async function extrairConteudo(url) {
  if (!url) return '';
  console.log(`📥 ${url.substring(0, 60)}...`);
  
  try {
    if (url.includes('cifraclub.com.br')) {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      let conteudo = $('.cifra').text() ||
                    $('.cifra-part').text() ||
                    $('[class*="cifra"]').first().text() ||
                    $('.letra').text();

      if (conteudo?.trim()) {
        return conteudo.trim().replace(/\n{3,}/g, '\n\n');
      }
    }
    return url;
  } catch (err) {
    console.error(`❌ ${url}:`, err.message.slice(0, 50));
    return url;
  }
}

// ✅ AUTENTICAÇÃO MODERNA (v4 google-spreadsheet)
async function main() {
  console.log('🎵 SCRAPER IMOSP v2.0 - Só aba "Músicas"');
  
  // Firebase
  const app = initializeApp(FIREBASE_CONFIG);
  const db = getDatabase(app);

  // Google Sheets auth (FIX para axios)
  const auth = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  
  // ✅ FIX: useAuth ao invés de axios manual
  await doc.useServiceAccountAuth(auth);
  await doc.loadInfo();
  
  console.log('📊 Planilha:', doc.title);
  console.log('📋 Abas:', doc.sheetsByIndex.map(s => s.title).join(', '));

  const musicasSheet = doc.sheetsByTitle['Músicas'];
  if (!musicasSheet) throw new Error('❌ Aba "Músicas" não existe!');

  const rows = await musicasSheet.getRows();
  console.log('🎼 Linhas:', rows.length);

  let saved = 0;
  for (const row of rows) {
    const nomeMusica = row.get('Música')?.trim();
    if (!nomeMusica) continue;

    const nomeSlug = normalizarNome(nomeMusica);
    const urlCifra = row.get('Cifra')?.trim() || '';

    const conteudo = await extrairConteudo(urlCifra);

    await set(ref(db, `musicas/${nomeSlug}`), {
      nomeOriginal: nomeMusica,
      letra: conteudo.includes('CifraClub') ? conteudo : 'Letra não encontrada',
      cifra: conteudo,
      urlOriginal: urlCifra,
      ultimaAtualizacao: new Date().toISOString()
    });

    saved++;
    process.stdout.write(`\r✅ ${saved}/${rows.length}`);
  }

  console.log(`\n🎉 ${saved} músicas salvas no Firebase!`);
}

main().catch(err => {
  console.error('\n💥 ERRO:', err.message);
  process.exit(1);
});
