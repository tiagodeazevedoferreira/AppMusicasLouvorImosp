// DEBUG OPCIONAL (igual anterior)
if (process.env.GOOGLESERVICEACCOUNTJSON) {
  console.log('DEBUG SECRET - Iniciando debugging...');
  console.log('Secret exists:', !!process.env.GOOGLESERVICEACCOUNTJSON);
  console.log('Secret length:', process.env.GOOGLESERVICEACCOUNTJSON?.length);
  try {
    const creds = JSON.parse(process.env.GOOGLESERVICEACCOUNTJSON);
    console.log('SUCCESS - Project ID:', creds.project_id, 'Client Email:', creds.client_email);
  } catch (e) {
    console.error('JSON ERROR:', e.message);
    process.exit(1);
  }
  console.log('DEBUG END');
}

import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import puppeteer from 'puppeteer';

console.log('Iniciando scrape GSheet -> Cifra Club -> Firebase...');

// CONFIGS
const SPREADSHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';
const SHEET_NAME = 'Músicas';
const URL_RANGE = `${SHEET_NAME}!F:F`;     // Coluna F: URLs
const LETRA_RANGE = `${SHEET_NAME}!A:E`;   // Colunas A-E: possivelmente nome/letra/etc
const FIREBASE_PATH = 'musicas';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/`,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

// GOOGLE SHEETS - COM LETRAS DA PLANILHA
async function getCifraClubData() {
  console.log('Lendo planilha...');
  
  let auth;
  if (process.env.GOOGLESERVICEACCOUNTJSON) {
    auth = new GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLESERVICEACCOUNTJSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  } else {
    auth = new GoogleAuth({
      keyFilename: './credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  }
  
  const sheets = google.sheets({ version: 'v4', auth });
  
  // URLs (col F)
  const urlRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: URL_RANGE,
  });
  const urls = urlRes.data.values?.slice(1)
    ?.map(row => row[0]?.toString().trim())
    ?.filter(url => url && url.includes('cifraclub.com.br')) || [];
  
  // Dados completos (A:E para letras/nome/etc)
  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: LETRA_RANGE,
  });
  const rows = dataRes.data.values || [];
  
  console.log('URLs encontrados:', urls.length);
  console.log('Total linhas planilha:', rows.length);
  
  // Map URL → linha completa
  const urlToRow = {};
  urls.forEach((url, index) => {
    if (rows[index + 1]) urlToRow[url] = rows[index + 1];
  });
  
  return { urls, urlToRow: urlToRow };
}

// SCRAPING - SÓ CIFRA (letra da planilha)
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function scrapeCifra(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent(userAgent);
    await page.setViewport({ width: 1366, height: 768 });
    
    console.log(`  → ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 });
    
    const data = await page.evaluate(() => {
      const title = document.querySelector('h1.fc-title, h1')?.innerText?.trim() || '';
      const artist = document.querySelector('.fc-artist a, .artist')?.innerText?.trim() || '';
      
      // CIFRA
      const cifraEls = document.querySelectorAll('.fc-chords, .cifra-content, pre, [class*="cifra"]');
      let cifra = '';
      for (const el of cifraEls) {
        const text = el.innerText?.trim();
        if (text?.length > 50 && /[A-G][b#]?/.test(text)) {
          cifra = el.innerText.trim();
          break;
        }
      }
      
      return { title, artist, cifra };
    });
    
    await browser.close();
    
    return {
      url,
      title: data.title || 'Título não encontrado',
      artist: data.artist || 'Artista não encontrado',
      cifra: data.cifra || 'Cifra não encontrada',
      letra: 'Letra da planilha ou manual'  // ← FALLBACK - ajuste coluna se tiver letra real
    };
    
  } catch (error) {
    console.error(`  ✗ ${url}:`, error.message);
    if (browser) await browser.close();
    return null;
  }
}

// FIREBASE - OBJETO COM CHAVE NORMALIZADA
async function saveMusicas(musicas, urlToRow) {
  if (!firebaseConfig.projectId) {
    console.log('AVISO: Sem Firebase config');
    return;
  }
  
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  
  const musicasObj = {};
  musicas.forEach(musica => {
    const chave = normalizarNome(musica.title);
    musicasObj[chave] = {
      ...musica,
      rowData: urlToRow[musica.url] || []  // Dados extras da planilha
    };
  });
  
  await set(ref(db, FIREBASE_PATH), musicasObj);
  console.log(`${Object.keys(musicasObj).length} salvas em ${FIREBASE_PATH}`);
}

function normalizarNome(nome) {
  return nome.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

// MAIN
async function main() {
  try {
    const { urls, urlToRow } = await getCifraClubData();
    if (!urls.length) {
      console.log('❌ Sem URLs na planilha');
      return;
    }
    
    const musicas = [];
    for (let i = 0; i < urls.length; i++) {
      console.log(`${i + 1}/${urls.length}:`);
      const musica = await scrapeCifra(urls[i]);
      if (musica) musicas.push(musica);
      
      if (i < urls.length - 1) await new Promise(r => setTimeout(r, 3000));
    }
    
    await saveMusicas(musicas, urlToRow);
    console.log(`\n🎉 ${musicas.length}/${urls.length} OK!`);
  } catch (error) {
    console.error('ERRO:', error.message);
    process.exit(1);
  }
}

main();
