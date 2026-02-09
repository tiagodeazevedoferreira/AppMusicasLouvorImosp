// === DEBUG SECRET ===
console.log('🔍 DEBUGGING SECRET...');
console.log('Secret exists:', !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
console.log('Secret length:', process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.length);

try {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  console.log('✅ SUCCESS:', creds.project_id, creds.client_email);
} catch (e) {
  console.error('❌ JSON ERROR:', e.message);
  console.error('Primeiros 200 chars:', process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.substring(0, 200));
  process.exit(1);
}
console.log('🔍 DEBUG END\n');




import { GoogleAuth } from 'google-auth-library';  // ✅ CORRETO
import { google } from 'googleapis';               // ✅ CORRETO
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import puppeteer from 'puppeteer';

console.log('🚀 Iniciando scrape GSheet → Cifra Club → Firebase...');

// === CONFIGS ===
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

// === GOOGLE SHEETS ===
async function getCifraClubUrls() {
  console.log('📊 Lendo planilha...');
  
  const auth = new GoogleAuth({
    keyFilename: './credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE,
  });

  const rows = res.data.values || [];
  const urls = rows
    .slice(1)
    .map(row => row[0]?.toString().trim())
    .filter(url => url && url.includes('cifraclub.com.br'));

  console.log(`✅ ${urls.length} URLs encontrados`);
  return urls;
}

// === SCRAPING ===
async function scrapeCifra(url) {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    const data = await page.evaluate(() => {
      const title = document.querySelector('h1.fc-title')?.innerText || '';
      const artist = document.querySelector('.fc-artist a')?.innerText || '';
      const cifraEl = document.querySelector('.fc-chords, .cifra-content, pre');
      const cifra = cifraEl ? cifraEl.innerText : '';
      
      return { url, title: title.trim(), artist: artist.trim(), cifra: cifra.trim() };
    });

    await browser.close();
    return data.cifra ? data : null;
  } catch (error) {
    console.error(`❌ ${url}:`, error.message);
    await browser.close();
    return null;
  }
}

// === FIREBASE ===
async function saveMusicas(musicas) {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  await set(ref(db, FIREBASE_PATH), musicas);
  console.log(`✅ ${musicas.length} salvas em /${FIREBASE_PATH}`);
}

// === MAIN ===
async function main() {
  try {
    const urls = await getCifraClubUrls();
    if (!urls.length) {
      console.log('⚠️ Sem URLs na planilha');
      return;
    }

    const musicas = [];
    for (let i = 0; i < urls.length; i++) {
      console.log(`[${i+1}/${urls.length}] ${urls[i]}`);
      const musica = await scrapeCifra(urls[i]);
      if (musica) musicas.push(musica);
      
      if (i < urls.length - 1) await new Promise(r => setTimeout(r, 3000));
    }

    await saveMusicas(musicas);
    console.log(`🎉 ${musicas.length}/${urls.length} OK!`);
  } catch (error) {
    console.error('💥 ERRO:', error.message);
    process.exit(1);
  }
}

main();
