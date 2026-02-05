import { GoogleSpreadsheet } from 'google-spreadsheet';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// ────────────────────────────────────────────────
// CONFIGURAÇÕES – ALTERE AQUI
// ────────────────────────────────────────────────

const SPREADSHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';

// Credenciais de serviço (você cria uma Service Account no Google Cloud)
const GOOGLE_SERVICE_ACCOUNT = {
  type: "service_account",
  project_id: process.env.GOOGLE_PROJECT_ID,
  private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
  private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  client_id: process.env.GOOGLE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL
};

// Firebase config (pegue do seu projeto)
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDcj5ebPcBXw5Ev6SQHXzxToCGfINprj_A",
  authDomain: "appmusicasimosp.firebaseapp.com",
  databaseURL: "https://appmusicasimosp-default-rtdb.firebaseio.com",
  projectId: "appmusicasimosp",
  storageBucket: "appmusicasimosp.appspot.com",
  messagingSenderId: "SEU_SENDER_ID_AQUI",
  appId: "SEU_APP_ID_AQUI"
};

// ────────────────────────────────────────────────
// FUNÇÕES AUXILIARES
// ────────────────────────────────────────────────

function normalizarNome(nome) {
  if (!nome) return '';
  return nome.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

async function extrairCifra(url) {
  if (!url || !url.includes('cifraclub.com.br')) {
    return url || '';
  }

  try {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Status ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);

    // Tenta pegar o container principal do Cifra Club
    let cifraText = $('.cifra').text() ||
                    $('.cifra-part').text() ||
                    $('[class*="cifra"]').first().text();

    if (cifraText) {
      // Limpa um pouco
      cifraText = cifraText.trim().replace(/\n{3,}/g, '\n\n');
      return cifraText;
    }

    return url; // fallback
  } catch (err) {
    console.error(`Falha ao extrair cifra de ${url}:`, err.message);
    return url;
  }
}

// ────────────────────────────────────────────────
// EXECUÇÃO PRINCIPAL
// ────────────────────────────────────────────────

async function main() {
  console.log('Iniciando migração para Firebase...');

  // Inicializa Firebase
  const app = initializeApp(FIREBASE_CONFIG);
  const db = getDatabase(app);

  // Inicializa Google Sheets com Service Account
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  await doc.useServiceAccountAuth(GOOGLE_SERVICE_ACCOUNT);
  await doc.loadInfo();

  // Carrega aba Músicas
  const musicasSheet = doc.sheetsByTitle['Músicas'];
  const musicasRows = await musicasSheet.getRows();

  // Carrega aba Letras
  const letrasSheet = doc.sheetsByTitle['Letras'];
  const letrasRows = await letrasSheet.getRows();

  // Mapa temporário de letras
  const letrasMap = new Map();
  letrasRows.forEach(row => {
    const nome = row.get('Nome')?.trim().toLowerCase();
    const letra = row.get('Letra')?.trim();
    if (nome && letra) letrasMap.set(nome, letra);
  });

  // Processa cada música
  for (const row of musicasRows) {
    const nome = row.get('Música')?.trim();
    if (!nome) continue;

    const nomeNormalizado = normalizarNome(nome);
    const cifraLink = row.get('Cifra')?.trim() || '';

    const letra = letrasMap.get(nome.toLowerCase()) || 'Letra não encontrada';
    const cifra = await extrairCifra(cifraLink);

    // Salva no Firebase
    const caminho = `musicas/${nomeNormalizado}`;
    await set(ref(db, caminho), {
      nomeOriginal: nome,
      letra,
      cifra,
      ultimaAtualizacao: new Date().toISOString()
    });

    console.log(`Salvo: ${nomeNormalizado}`);
  }

  console.log('Migração concluída com sucesso!');
}

main().catch(err => {
  console.error('Erro na migração:', err);
  process.exit(1);
});