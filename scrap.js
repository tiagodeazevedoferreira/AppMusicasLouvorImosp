// DEBUG OPCIONAL - Só roda se env existir
if (process.env.GOOGLESERVICEACCOUNTJSON) {
  console.log('DEBUG SECRET - Iniciando debugging...');
  console.log('Secret exists:', !!process.env.GOOGLESERVICEACCOUNTJSON);
  console.log('Secret length:', process.env.GOOGLESERVICEACCOUNTJSON?.length);
  try {
    const creds = JSON.parse(process.env.GOOGLESERVICEACCOUNTJSON);
    console.log('SUCCESS - Project ID:', creds.project_id, 'Client Email:', creds.client_email);
  } catch (e) {
    console.error('JSON ERROR:', e.message);
    console.error('Primeiros 200 chars:', process.env.GOOGLESERVICEACCOUNTJSON?.substring(0, 200));
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
const SHEET_NAME = 'Página1';
const RANGE = `${SHEET_NAME}!F:F`;
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

// GOOGLE SHEETS - FALLBACK LOCAL
async function getCifraClubUrls() {
  console.log('Lendo planilha...');
  
  let auth;
  if (process.env.GOOGLESERVICEACCOUNTJSON) {
    // GH Actions mode
    auth = new GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLESERVICEACCOUNTJSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  } else {
    // Local mode - usa service account file
    auth = new GoogleAuth({
      keyFilename: './credentials.json',  // Crie este arquivo localmente
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  }
  
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE,
  });
  const rows = res.data.values;
  const urls = rows
    ?.slice(1)
    ?.map(row => row[0]?.toString().trim())
    ?.filter(url => url && url.includes('cifraclub.com.br'));
  console.log(urls?.length || 0, 'URLs encontrados');
  return urls || [];
}

// SCRAPING (igual à versão anterior)
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function scrapeCifra(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote'
      ]
    });
    const page = await browser.newPage();
    await page.setUserAgent(userAgent);
    await page.setViewport({ width: 1366, height: 768 });
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 });
    await page.waitForSelector('h1, .fc-title, .cifra-content, pre', { timeout: 10000 });
    
    const data = await page.evaluate(() => {
      const title = document.querySelector('h1.fc-title, h1, title')?.innerText?.trim() || '';
      const artist = document.querySelector('.fc-artist a, .artist')?.innerText?.trim() || '';
      
      const cifraEls = document.querySelectorAll('.fc-chords, .cifra-content, pre, [class*="cifra"], [class*="chord"]');
      let cifra = '';
      for (const el of cifraEls) {
        const text = el.innerText?.trim();
        if (text && text.length > 50 && /[A-G][b#]?m?/.test(text)) {
          cifra = text;
          break;
        }
      }
      
      return { title, artist, cifra };
    });
    
    await browser.close();
    return data.cifra ? { url, title: data.title.trim(), artist: data.artist.trim(), cifra: data.cifra.trim() } : null;
    
  } catch (error) {
    console.error(`${url}:`, error.message);
    if (browser) await browser.close();
    return null;
  }
}

// FIREBASE
async function saveMusicas(musicas) {
  if (!firebaseConfig.projectId) {
    console.log('AVISO: Sem config Firebase - pulando save');
    return;
  }
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  await set(ref(db, FIREBASE_PATH), musicas);
  console.log(musicas.length, 'salvas em', FIREBASE_PATH);
}

// MAIN
async function main() {
  try {
    const urls = await getCifraClubUrls();
    if (!urls.length) {
      console.log('Sem URLs na planilha');
      return;
    }
    const musicas = [];
    for (let i = 0; i < urls.length; i++) {
      console.log(`${i + 1}/${urls.length}:`, urls[i]);
      const musica = await scrapeCifra(urls[i]);
      if (musica) musicas.push(musica);
      
      if (i < urls.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    await saveMusicas(musicas);
    console.log(`${musicas.length}/${urls.length} OK!`);
  } catch (error) {
    console.error('ERRO:', error.message);
    process.exit(1);
  }
}

main();
