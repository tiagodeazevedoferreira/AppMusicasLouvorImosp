// Configurações
const SHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';
const API_KEY = 'AIzaSyDcj5ebPcBXw5Ev6SQHXzxToCGfINprj_A';

// Variáveis globais
let musicas = [];
let dadosFirebaseMap = new Map(); // chave normalizada → { letra, cifra }

// Normaliza nome para chave do Firebase
function normalizarNome(nome) {
  if (!nome) return '';
  return nome.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

// Carrega dados
async function carregarDados() {
  try {
    // Carrega músicas da planilha
    const resMusicas = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Músicas?key=${API_KEY}`
    );
    if (!resMusicas.ok) throw new Error('Erro ao carregar Músicas');
    const dataMusicas = await resMusicas.json();
    musicas = dataMusicas.values.slice(1);
    console.log('Músicas carregadas da planilha:', musicas.length);

    // Tenta carregar do Firebase
    if (window.firebaseDb) {
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
        console.log('Firebase carregado:', dadosFirebaseMap.size, 'itens');
      } else {
        console.warn('Nenhum dado no Firebase');
      }
    } else {
      console.warn('Firebase não inicializado');
    }

    preencherFiltros();
    filtrarEMostrar();
  } catch (err) {
    console.error('Erro geral ao carregar:', err);
    document.getElementById('resultados').innerHTML = 
      '<p class="text-warning">Alguns dados não carregaram. Clique em "Limpar filtros" para tentar novamente.</p>';
    // Continua com o que foi carregado
    preencherFiltros();
    filtrarEMostrar();
  }
}

function preencherFiltros() {
  const selectArtista = document.getElementById('filtroArtista');
  const selectTom = document.getElementById('filtroTom');
  const selectData = document.getElementById('filtroData');
  const selectMusica = document.getElementById('filtroMusica');

  // Limpa opções existentes (exceto a primeira)
  [selectArtista, selectTom, selectData, selectMusica].forEach(select => {
    while (select.options.length > 1) select.remove(1);
  });

  // Artistas
  const artistasUnicos = [...new Set(musicas.map(m => m[2] || ''))].filter(Boolean).sort();
  artistasUnicos.forEach(art => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = art;
    selectArtista.appendChild(opt);
  });

  // Tons
  const tonsUnicos = [...new Set(musicas.map(m => m[1] || ''))].filter(Boolean).sort();
  tonsUnicos.forEach(tom => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = tom;
    selectTom.appendChild(opt);
  });

  // Datas
  const datasUnicas = [...new Set(musicas.map(m => m[4] || ''))].filter(Boolean).sort().reverse();
  datasUnicas.forEach(dt => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = dt;
    selectData.appendChild(opt);
  });

  // Músicas
  const musicasValidas = musicas
    .filter(m => m[0] && typeof m[0] === 'string' && m[0].trim())
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  musicasValidas.forEach(m => {
    const nome = m[0].trim();
    const opt = document.createElement('option');
    opt.value = opt.textContent = nome;
    selectMusica.appendChild(opt);
  });
}

function filtrarEMostrar() {
  // Declara todas as variáveis no início (isso corrige o erro)
  const musicaSelecionada = document.getElementById('filtroMusica')?.value || '';
  const nome = document.getElementById('filtroNome')?.value?.trim().toLowerCase() || '';
  const artista = document.getElementById('filtroArtista')?.value || '';
  const tom = document.getElementById('filtroTom')?.value || '';
  const letraBusca = document.getElementById('filtroLetra')?.value?.trim().toLowerCase() || '';
  const data = document.getElementById('filtroData')?.value || '';

  const resultadosFiltrados = musicas.filter(mus => {
    const [nomeMus, tomMus, art, link, dt] = mus || [];

    const matchMusica = !musicaSelecionada || nomeMus === musicaSelecionada;
    const matchNome = !nome || (nomeMus || '').toLowerCase().includes(nome);
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

function mostrarResultados(lista) {
  const container = document.getElementById('resultados');
  container.innerHTML = '';

  if (lista.length === 0) {
    container.innerHTML = '<p class="text-center text-muted">Nenhuma música encontrada.</p>';
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

    const card = document.createElement('div');
    card.className = 'col-12';
    card.innerHTML = `
      <div class="card">
        <div class="card-body">
          <h5 class="card-title">${nomeMus || 'Sem nome'}</h5>
          <p class="card-text">
            <strong>Artista:</strong> ${artista || ''} <br>
            <strong>Tom:</strong> ${tom || ''}
          </p>
          
          <button class="btn btn-outline-primary btn-sm me-2" 
                  onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'block' ? 'none' : 'block'">
            Ver letra
          </button>
          <div class="letra-expand mt-2">${letra}</div>

          ${videoId ? `
            <button class="btn btn-outline-danger btn-sm mt-2 me-2" 
                    onclick="this.nextElementSibling.innerHTML = '<div class=\\\'iframe-container\\\'><iframe src=\\\'https://www.youtube.com/embed/${videoId}\\\' frameborder=\\\'0\\\' allowfullscreen></iframe></div>'">
              Ver vídeo
            </button>
            <div class="mt-3"></div>
          ` : ''}

          ${hasCifra ? `
            <button class="btn btn-outline-success btn-sm mt-2" 
                    onclick="this.nextElementSibling.innerHTML = '<div class=\\\'iframe-container\\\'><iframe src=\\\'${encodeURIComponent(cifraLink)}\\\' frameborder=\\\'0\\\' allowfullscreen></iframe></div>'">
              Ver cifra
            </button>
            <div class="mt-3"></div>
          ` : ''}
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// Eventos
document.getElementById('filtroMusica')?.addEventListener('change', filtrarEMostrar);
document.getElementById('filtroNome')?.addEventListener('input', filtrarEMostrar);
document.getElementById('filtroArtista')?.addEventListener('change', filtrarEMostrar);
document.getElementById('filtroTom')?.addEventListener('change', filtrarEMostrar);
document.getElementById('filtroLetra')?.addEventListener('input', filtrarEMostrar);
document.getElementById('filtroData')?.addEventListener('change', filtrarEMostrar);

document.getElementById('btnLimpar')?.addEventListener('click', () => {
  ['filtroMusica', 'filtroNome', 'filtroArtista', 'filtroTom', 'filtroLetra', 'filtroData'].forEach(id => {
    document.getElementById(id).value = '';
  });
  filtrarEMostrar();
});

// Inicia
carregarDados();