import { GoogleAuth } from 'googleapis/build/src/google';
import { google } from 'googleapis';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import puppeteer from 'puppeteer';

console.log('🚀 Iniciando scrape GSheet → Cifra Club → Firebase...');

// === CONFIGS ===
const SPREADSHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';
const SHEET_NAME = 'Página1'; // ajuste se necessário
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

// === 1. GOOGLE SHEETS ===
async function getCifraClubUrls() {
  console.log('📊 Lendo planilha Google Sheets...');
  
  const auth = new GoogleAuth({
    keyFilename: './credentials.json', // gerado pelo workflow
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE,
  });

  const rows = res.data.values || [];
  const urls = rows
    .slice(1) // pula header
    .map(row => row[0]?.toString().trim())
    .filter(url => url && url.includes('cifraclub.com.br'));

  console.log(`✅ ${urls.length} URLs válidos encontrados`);
  return urls;
}

// === 2. SCRAPING CIFRA CLUB ===
async function scrapeCifra(url) {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // GitHub Actions
  });
  
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    const data = await page.evaluate(() => {
      // Título e artista
      const title = document.querySelector('h1.fc-title')?.innerText || '';
      const artist = document.querySelector('.fc-artist a')?.innerText || '';
      
      // Cifra/Letra (seletores Cifra Club 2026)
      const cifraEl = document.querySelector('.fc-chords') || 
                     document.querySelector('.cifra-content') ||
                     document.querySelector('pre');
      const cifra = cifraEl ? cifraEl.innerText : '';
      
      return { url, title: title.trim(), artist: artist.trim(), cifra: cifra.trim() };
    });

    await browser.close();
    return data.cifra ? data : null;
  } catch (error) {
    console.error(`❌ Erro scraping ${url}:`, error.message);
    await browser.close();
    return null;
  }
}

// === 3. FIREBASE ===
async function saveMusicas(musicas) {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  
  await set(ref(db, FIREBASE_PATH), musicas);
  console.log(`✅ ${musicas.length} músicas salvas em /${FIREBASE_PATH}`);
}

// === EXECUÇÃO ===
async function main() {
  try {
    const urls = await getCifraClubUrls();
    if (urls.length === 0) {
      console.log('⚠️ Nenhuma URL encontrada na planilha');
      return;
    }

    console.log('🎸 Iniciando scraping das cifras...');
    const musicas = [];
    
    for (let i = 0; i < urls.length; i++) {
      console.log(`[${i+1}/${urls.length}] ${urls[i]}`);
      const musica = await scrapeCifra(urls[i]);
      
      if (musica) {
        musicas.push(musica);
        console.log(`  ✅ ${musica.title} - ${musica.artist}`);
      }
      
      // Rate limit: 3s entre requests
      if (i < urls.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    await saveMusicas(musicas);
    console.log(`🎉 FINALIZADO: ${musicas.length}/${urls.length} sucessos`);

  } catch (error) {
    console.error('💥 ERRO FATAL:', error.message);
    process.exit(1);
  }
}

main();
