import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import { JWT } from 'google-auth-library';
import puppeteer from 'puppeteer';
import pLimit from 'p-limit';

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

// Função para extrair cifra com Puppeteer (renderiza JS)
async function extrairCifra(url, browser) {
  if (!url || !url.includes('cifraclub.com.br')) return url || '';

  let page;
  try {
    page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Espera pelo container da cifra
    await page.waitForSelector('.art_cifra, .cifra, [class*="cifra"]', { timeout: 10000 });

    // Extrai o texto completo da cifra
    const cifra = await page.evaluate(() => {
      const container = document.querySelector('.art_cifra, .cifra, [class*="cifra"]');
      return container ? container.innerText.trim().replace(/\n{3,}/g, '\n\n') : '';
    });

    if (!cifra) return url; // Se vazio, fallback para URL

    return cifra;
  } catch (err) {
    console.error(`Erro ao extrair ${url}: ${err.message}`);
    return url; // Fallback para URL em caso de erro/timeout
  } finally {
    if (page) await page.close();
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
  console.log('⚡ IMOSP SCRAPER v5 - Com Puppeteer para renderização JS');
  
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

  // Lança browser Puppeteer (headless, no-sandbox para GitHub Actions)
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  });

  // Limita a 5 processamentos paralelos para evitar sobrecarga
  const limit = pLimit(5);

  const promises = musicas.map(([nome, tom, artista, vazio, data, urlCifra], index) =>
    limit(async () => {
      if (!nome?.trim()) return;

      console.log(`⏳ ${index + 1}/${musicas.length}: ${nome.trim()}`);
      
      const slug = normalizarNome(nome);
      let conteudo = await extrairCifra(urlCifra, browser);

      // Retry uma vez se falhou (conteudo === urlCifra)
      if (conteudo === urlCifra) {
        console.log(`🔄 Retry para ${nome.trim()}`);
        conteudo = await extrairCifra(urlCifra, browser);
      }

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
    })
  );

  await Promise.allSettled(promises); // Usa allSettled para não parar se uma falhar
  await browser.close();

  console.log('🎉 TODAS processadas!');
}

main().catch(err => {
  console.error('💥', err.message);
  process.exit(1);
});