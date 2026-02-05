// app.js - COMPLETO e CORRIGIDO
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

// Configurações
const SHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';
const API_KEY = 'AIzaSyDcj5ebPcBXw5Ev6SQHXzxToCGfINprj_A';

// Variáveis globais
let musicas = [];
let dadosFirebaseMap = new Map();

// Normaliza nome (igual ao scraper)
function normalizarNome(nome) {
  if (!nome || typeof nome !== 'string') return '';
  return nome.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Carrega dados da planilha + Firebase
async function carregarDados() {
  console.log('Iniciando carregamento...');
  try {
    // 1. Carrega planilha Google Sheets
    const resMusicas = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Músicas?key=${API_KEY}`
    );
    if (!resMusicas.ok) throw new Error(`Planilha: ${resMusicas.status}`);
    const dataMusicas = await resMusicas.json();
    musicas = dataMusicas.values?.slice(1) || [];
    console.log('Planilha OK:', musicas.length, 'músicas');

    // 2. Aguarda Firebase (agora garantido pelo index.html)
    if (!window.firebaseDb) {
      console.log('Aguardando Firebase...');
      await new Promise(resolve => {
        const check = setInterval(() => {
          if (window.firebaseDb) {
            clearInterval(check);
            resolve();
          }
        }, 200);
      });
    }

    // 3. Carrega letras/cifras do Firebase
    if (window.firebaseDb) {
      try {
        console.log('Acessando nó "musicas"...');
        const dbRef = ref(window.firebaseDb, 'musicas');
        const snapshot = await get(dbRef);
        if (snapshot.exists()) {
          const dados = snapshot.val();
          Object.keys(dados).forEach(chave => {
            dadosFirebaseMap.set(chave, {
              letra: dados[chave].letra || 'Letra não encontrada',
              cifra: dados[chave].cifra || ''
            });
          });
          console.log('Firebase OK! Total músicas:', dadosFirebaseMap.size);
        } else {
          console.log('Firebase: nó "musicas" vazio');
        }
      } catch (fbErr) {
        console.error('Erro ao ler Firebase:', fbErr.message);
      }
    } else {
      console.warn('Firebase não disponível');
    }

    preencherFiltros();
    filtrarEMostrar();
  } catch (err) {
    console.error('Erro geral:', err.message);
    document.getElementById('resultados').innerHTML = `
      <div class="col-12 text-center py-5">
        <i class="bi bi-exclamation-triangle display-1 text-warning"></i>
        <p class="mt-3">Carregamento parcial. Tente "Limpar filtros".</p>
      </div>`;
    preencherFiltros();
    filtrarEMostrar();
  }
}

// Preenche selects com opções únicas
function preencherFiltros() {
  const selectArtista = document.getElementById('filtroArtista');
  const selectTom = document.getElementById('filtroTom');
  const selectData = document.getElementById('filtroData');
  const selectMusica = document.getElementById('filtroMusica');

  // Limpa opções (mantém "Todos")
  [selectArtista, selectTom, selectData, selectMusica].forEach(sel => {
    while (sel.options.length > 1) sel.remove(1);
  });

  // Artistas únicos
  [...new Set(musicas.map(m => m[2] || ''))]
    .filter(Boolean).sort()
    .forEach(art => {
      const opt = new Option(art, art);
      selectArtista.add(opt);
    });

  // Tons únicos
  [...new Set(musicas.map(m => m[1] || ''))]
    .filter(Boolean).sort()
    .forEach(tom => {
      const opt = new Option(tom, tom);
      selectTom.add(opt);
    });

  // Datas únicas (mais recente primeiro)
  [...new Set(musicas.map(m => m[4] || ''))]
    .filter(Boolean).sort((a, b) => b.localeCompare(a))
    .forEach(dt => {
      const opt = new Option(dt, dt);
      selectData.add(opt);
    });

  // Todas as músicas (alfabética)
  musicas
    .filter(m => m[0]?.trim())
    .sort((a, b) => (a[0] || '').localeCompare(b[0] || '', 'pt-BR'))
    .forEach(m => {
      const nome = m[0].trim();
      const opt = new Option(nome, nome);
      selectMusica.add(opt);
    });
}

// Filtra e mostra resultados
function filtrarEMostrar() {
  const musicaSelecionada = document.getElementById('filtroMusica')?.value || '';
  const nomeBusca = document.getElementById('filtroNome')?.value?.trim().toLowerCase() || '';
  const artista = document.getElementById('filtroArtista')?.value || '';
  const tom = document.getElementById('filtroTom')?.value || '';
  const letraBusca = document.getElementById('filtroLetra')?.value?.trim().toLowerCase() || '';
  const data = document.getElementById('filtroData')?.value || '';

  const resultadosFiltrados = musicas.filter(mus => {
    const [nomeMus, tomMus, art, link, dt] = mus || [];
    const matchMusica = !musicaSelecionada || nomeMus === musicaSelecionada;
    const matchNome = !nomeBusca || (nomeMus || '').toLowerCase().includes(nomeBusca);
    const matchArtista = !artista || art === artista;
    const matchTom = !tom || tomMus === tom;
    const matchData = !data || dt === data;
    
    let matchLetra = true;
    if (letraBusca) {
      const chave = normalizarNome(nomeMus);
      const letraMus = dadosFirebaseMap.get(chave)?.letra || '';
      matchLetra = letraMus.toLowerCase().includes(letraBusca);
    }
    
    return matchMusica && matchNome && matchArtista && matchTom && matchData && matchLetra;
  });

  resultadosFiltrados.sort((a, b) => (a[0] || '').localeCompare(b[0] || '', 'pt-BR'));
  mostrarResultados(resultadosFiltrados);
}

// Renderiza cards das músicas
function mostrarResultados(lista) {
  const container = document.getElementById('resultados');
  container.innerHTML = '';

  if (lista.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center py-5">
        <i class="bi bi-music-note-beamed display-1 text-muted"></i>
        <h4 class="mt-3 text-muted">Nenhuma música encontrada</h4>
        <p>Tente ajustar os filtros ou limpar todos.</p>
      </div>`;
    return;
  }

  lista.forEach(mus => {
    const [nomeMus, tom, artista, link, data] = mus || [];
    const chave = normalizarNome(nomeMus);
    const dadosFb = dadosFirebaseMap.get(chave) || { letra: 'Letra não encontrada', cifra: '' };
    const letra = dadosFb.letra;
    const cifraLink = dadosFb.cifra;

    let videoId = '';
    if (link) {
      const match = link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
      videoId = match ? match[1] : '';
    }

    const hasCifra = !!cifraLink?.trim();
    const hasVideo = !!videoId;

    const card = document.createElement('div');
    card.className = 'col-12 col-lg-6 col-xl-4';
    card.innerHTML = `
      <div class="card musica-card h-100 shadow-lg">
        <div class="card-body">
          <h5 class="card-title fw-bold mb-1">${nomeMus}</h5>
          <p class="card-text mb-2">
            <i class="bi bi-person-fill me-1"></i><strong>Artista:</strong> ${artista || 'Não informado'}<br>
            <i class="bi bi-music-note-list me-1"></i><strong>Tom:</strong> ${tom || 'Não informado'}
            ${data ? `<br><i class="bi bi-calendar me-1"></i><small class="opacity-75">${data}</small>` : ''}
          </p>
          
          ${hasVideo ? `
            <iframe class="w-100 rounded mb-3" height="200" 
                    src="https://www.youtube.com/embed/${videoId}" 
                    title="${nomeMus}" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
            </iframe>
          ` : ''}

          ${hasCifra ? `
            <div class="mb-3">
              <a href="${cifraLink}" target="_blank" class="btn btn-light btn-sm w-100">
                <i class="bi bi-guitar"></i> Ver Cifra Completa
              </a>
            </div>
          ` : ''}

          <div class="letra" style="max-height: 300px; overflow-y: auto;">
            ${letra}
          </div>
          
          <div class="mt-3 pt-3 border-top border-white border-opacity-25 d-flex gap-2">
            ${hasCifra ? `<span class="badge bg-light text-dark"><i class="bi bi-guitar"></i> Cifra OK</span>` : ''}
            <span class="badge bg-light text-dark"><i class="bi bi-file-earmark-text"></i> Letra</span>
          </div>
        </div>
      </div>`;
    container.appendChild(card);
  });
}

// Limpa todos os filtros
function limparFiltros() {
  document.getElementById('filtroNome').value = '';
  document.getElementById('filtroLetra').value = '';
  document.getElementById('filtroArtista').selectedIndex = 0;
  document.getElementById('filtroTom').selectedIndex = 0;
  document.getElementById('filtroData').selectedIndex = 0;
  document.getElementById('filtroMusica').selectedIndex = 0;
  filtrarEMostrar();  // Reaplica filtros vazios
  console.log('Filtros limpos!');
}


// Auto-carrega ao inicializar
document.addEventListener('DOMContentLoaded', carregarDados);

// Listeners para filtros em tempo real
['filtroNome', 'filtroArtista', 'filtroTom', 'filtroData', 'filtroMusica', 'filtroLetra'].forEach(id => {
  document.getElementById(id).addEventListener('input', filtrarEMostrar);
});
