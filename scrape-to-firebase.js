import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// CONFIGURAÇÕES
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

// FUNÇÕES AUXILIARES
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

    let cifraText = $('.cifra').text() ||
                   $('.cifra-part').text() ||
                   $('[class*="cifra"]').first().text();

    if (cifraText) {
      cifraText = cifraText.trim().replace(/\n{3,}/g, '\n\n');
      return cifraText;
    }

    return url;
  } catch (err) {
    console.error(`Falha ao extrair cifra de ${url}:`, err.message);
    return url;
  }
}

// EXECUÇÃO PRINCIPAL
async function main() {
  console.log('🚀 Iniciando migração para Firebase...');

  // Inicializa Firebase
  const app = initializeApp(FIREBASE_CONFIG);
  const db = getDatabase(app);

  // Autenticação Service Account
  const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  doc.axios.defaults.headers.common.Authorization = `Bearer ${await serviceAccountAuth.authorize().then(r => r.access_token)}`;

  await doc.loadInfo();
  console.log('📊 Planilha carregada:', doc.title);

  // ✅ SÓ ABA "Músicas" (sem exigir "Letras")
  const musicasSheet = doc.sheetsByTitle['Músicas'];
  if (!musicasSheet) {
    throw new Error('❌ Aba "Músicas" não encontrada!');
  }
  const musicasRows = await musicasSheet.getRows();
  console.log('🎵 Músicas encontradas:', musicasRows.length);

  let contador = 0;
  for (const row of musicasRows) {
    const nome = row.get('Música')?.trim();
    if (!nome) continue;

    const nomeNormalizado = normalizarNome(nome);
    const cifraLink = row.get('Cifra')?.trim() || '';

    // Letra padrão (sem aba Letras)
    const letra = 'Letra não encontrada na planilha. Adicione manualmente no Firebase.';

    const cifra = await extrairCifra(cifraLink);

    // Salva no Firebase
    const caminho = `musicas/${nomeNormalizado}`;
    await set(ref(db, caminho), {
      nomeOriginal: nome,
      letra,
      cifra,
      ultimaAtualizacao: new Date().toISOString()
    });

    contador++;
    console.log(`✅ ${contador}/${musicasRows.length} Salvo: ${nomeNormalizado}`);
  }

  console.log(`🎉 Migração concluída! ${contador} músicas salvas no Firebase.`);
}

main().catch(err => {
  console.error('❌ Erro na migração:', err.message);
  process.exit(1);
});
