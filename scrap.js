import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

const SPREADSHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';
const RANGE = 'Página1!F:F';
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

async function getUrlsCifraClub() {
  const auth = new GoogleAuth({
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE,
  });

  const values = response.data.values || [];
  const urls = values
    .slice(1) // pula header
    .map(row => row[0]?.trim())
    .filter(url => url && url.includes('cifraclub.com.br'));

  console.log(`Encontradas ${urls.length} URLs do Cifra Club.`);
  return urls;
}

async function scrapeCifraClub(url) {
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Extrai seletor específico do Cifra Club (testado na estrutura atual)
    const cifraData = await page.evaluate(() => {
      // Letra/cifra principal (acordes + letra)
      const cifraContent = document.querySelector('.js-cifra-content')?.innerText || 
                          Array.from(document.querySelectorAll('.cifra-verse, .cifra-chorus, .cifra-bridge')).map(el => el.innerText).join('\n') ||
                          document.querySelector('pre')?.innerText || '';

      // Metadados
      const title = document.querySelector('h1')?.innerText || '';
      const artist = document.querySelector('[data-artist]')?.getAttribute('data-artist') || 
                    document.querySelector('.artist-name')?.innerText || '';

      return {
        url,
        title,
        artist,
        cifra: cifraContent.trim()
      };
    });

    return cifraData;
  } finally {
    await browser.close();
  }
}

async function saveMusicas(musicas) {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const musicasRef = ref(db, FIREBASE_PATH);

  await set(musicasRef, musicas);
  console.log(`✅ ${musicas.length} músicas salvas em Firebase/${FIREBASE_PATH}`);
}

async function main() {
  try {
    console.log('🚀 Iniciando scrape GSheet → Cifra Club → Firebase...');
    
    const urls = await getUrlsCifraClub();
    const musicas = [];

    // Processa cada URL (com delay para não sobrecarregar)
    for (let i = 0; i < urls.length; i++) {
      console.log(`📖 Scraping ${i + 1}/${urls.length}: ${urls[i]}`);
      const musica = await scrapeCifraClub(urls[i]);
      
      if (musica.cifra) {
        musicas.push(musica);
        console.log(`✅ ${musica.title || 'Música'} capturada`);
      } else {
        console.log(`⚠️ Sem cifra encontrada em ${urls[i]}`);
      }

      // Delay 2s entre requests
      if (i < urls.length - 1) await new Promise(r => setTimeout(r, 2000));
    }

    await saveMusicas(musicas);
    console.log(`🎉 Processo concluído! ${musicas.length}/${urls.length} músicas processadas.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

main();
