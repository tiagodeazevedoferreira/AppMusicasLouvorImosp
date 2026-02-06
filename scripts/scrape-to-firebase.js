import { GoogleSpreadsheet } from 'google-spreadsheet';
import { GoogleAuth } from 'google-auth-library';  // ✅ NOVA v4
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// CONFIGS
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
  try {
    if (url.includes('cifraclub.com.br')) {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) return url;
      
      const html = await res.text();
      const $ = cheerio.load(html);
      
      let conteudo = $('.cifra').text() ||
                    $('.cifra-part').text() ||
                    $('[class*="cifra"]').first().text();
      
      return conteudo?.trim()?.replace(/\n{3,}/g, '\n\n') || url;
    }
    return url;
  } catch {
    return url;
  }
}

// ✅ V4 AUTH OFICIAL (funciona sempre)
async function main() {
  console.log('🎵 IMOSP SCRAPER v3.0 - google-spreadsheet v4+');
  
  // Firebase
  const app = initializeApp(FIREBASE_CONFIG);
  const db = getDatabase(app);

  // 🔑 GOOGLE AUTH v4 (CORRETO)
  const auth = new GoogleAuth({
    keyFilename: undefined, // Usa env vars
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_id: process.env.GOOGLE_CLIENT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      project_id: process.env.GOOGLE_PROJECT_ID,
      client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL
    }
  });

  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  await doc.authWithClientEmail({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  
  await doc.loadInfo();
  console.log('📊 Planilha:', doc.title);
  console.log('📋 Abas:', doc.sheetsByIndex.map(s => s.title).join(', '));

  const sheet = doc.sheetsByTitle['Músicas'];
  if (!sheet) throw new Error('❌ Aba "Músicas" não encontrada');

  const rows = await sheet.getRows();
  console.log('🎼 Músicas:', rows.length);

  let saved = 0;
  for (const row of rows) {
    const nome = row.get('Música')?.trim();
    if (!nome) continue;

    const slug = normalizarNome(nome);
    const urlCifra = row.get('Cifra')?.trim() || '';
    const conteudo = await extrairConteudo(urlCifra);

    await set(ref(db, `musicas/${slug}`), {
      nomeOriginal: nome,
      letra: conteudo,
      cifra: conteudo,
      urlOriginal: urlCifra,
      ultimaAtualizacao: new Date().toISOString()
    });

    saved++;
    if (saved % 20 === 0 || saved === rows.length) {
      console.log(`✅ ${saved}/${rows.length}`);
    }
  }

  console.log(`🎉 ${saved} músicas salvas!`);
}

main().catch(err => {
  console.error('💥 ERRO:', err.message);
  process.exit(1);
});
