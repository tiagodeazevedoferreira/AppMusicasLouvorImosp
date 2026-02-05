// Configurações
const SHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';
const API_KEY = 'AIzaSyDcj5ebPcBXw5Ev6SQHXzxToCGfINprj_A';

// Variáveis globais
let musicas = [];
let dadosFirebaseMap = new Map(); // chave normalizada → { letra, cifra }

// Normaliza nome (igual ao script de migração)
function normalizarNome(nome) {
  if (!nome || typeof nome !== 'string') return '';
  return nome.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Carrega dados da planilha e tenta Firebase
async function carregarDados() {
  console.log('Iniciando carregamento dos dados...');

  try {
    // 1. Carrega músicas da planilha
    const resMusicas = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Músicas?key=${API_KEY}`
    );
    if (!resMusicas.ok) throw new Error(`Erro na planilha: ${resMusicas.status}`);
    const dataMusicas = await resMusicas.json();
    musicas = dataMusicas.values?.slice(1) || [];
    console.log('Planilha carregada:', musicas.length, 'músicas');

    // 2. Aguarda Firebase estar pronto
    if (!window.firebaseDb) {
      console.log('Aguardando Firebase inicializar...');
      await new Promise(resolve => {
        const check = setInterval(() => {
          if (window.firebaseDb || window.firebaseReady === false) {
            clearInterval(check);
            resolve();
          }
        }, 200);
      });
    }

    // 3. Carrega dados do Firebase
    if (window.firebaseDb) {
      try {
        const dbRef = ref(window.firebaseDb, 'musicas');
        const snapshot = await get(dbRef);

        if (snapshot.exists()) {
          const dados = snapshot.val();
          Object.keys(dados).forEach(chave => {
            const item = dados[chave];
            dadosFirebaseMap.set(chave, {
              letra: item.letra || 'Letra não encontrada no Firebase',
              cifra: item.cifra || ''
            });
          });
          console.log('Firebase carregado! Total de músicas:', dadosFirebaseMap.size);
        } else {
          console.log('Nenhum dado encontrado no nó "musicas"');
        }
      } catch (fbErr) {
        console.error('Erro ao ler Firebase (continuando sem ele):', fbErr.message);
      }
    } else {
      console.warn('Firebase não inicializado');
    }

    // 4. Preenche filtros e mostra resultados
    preencherFiltros();
    filtrarEMostrar();
  } catch (err) {
    console.error('Erro geral no carregamento:', err.message);
    document.getElementById('resultados').innerHTML = 
      '<p class="text-warning">Carregamento parcial. Alguns dados podem estar indisponíveis. Tente limpar filtros.</p>';
    preencherFiltros();
    filtrarEMostrar();
  }
}

function preencherFiltros() {
  const selectArtista = document.getElementById('filtroArtista');
  const selectTom = document.getElementById('filtroTom');
  const selectData = document.getElementById('filtroData');
  const selectMusica = document.getElementById('filtroMusica');

  // Limpa opções (mantém a primeira vazia)
  [selectArtista, selectTom, selectData, selectMusica].forEach(sel => {
    while (sel.options.length > 1) sel.remove(1);
  });

  // Artistas
  [...new Set(musicas.map(m => m[2] || ''))]
    .filter(Boolean)
    .sort()
    .forEach(art => {
      const opt = new Option(art, art);
      selectArtista.add(opt);
    });

  // Tons
  [...new Set(musicas.map(m => m[1] || ''))]
    .filter(Boolean)
    .sort()
    .forEach(tom => {
      const opt = new Option(tom, tom);
      selectTom.add(opt);
    });

  // Datas
  [...new Set(musicas.map(m => m[4] || ''))]
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))
    .forEach(dt => {
      const opt = new Option(dt, dt);
      selectData.add(opt);
    });

  // Músicas
  musicas
    .filter(m => m[0]?.trim())
    .sort((a, b) => (a[0] || '').localeCompare(b[0] || '', 'pt-BR'))
    .forEach(m => {
      const nome = m[0].trim();
      const opt = new Option(nome, nome);
      selectMusica.add(opt);
    });
}

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

// Eventos dos filtros
document.getElementById('filtroMusica')?.addEventListener('change', filtrarEMostrar);
document.getElementById('filtroNome')?.addEventListener('input', filtrarEMostrar);
document.getElementById('filtroArtista')?.addEventListener('change', filtrarEMostrar);
document.getElementById('filtroTom')?.addEventListener('change', filtrarEMostrar);
document.getElementById('filtroLetra')?.addEventListener('input', filtrarEMostrar);
document.getElementById('filtroData')?.addEventListener('change', filtrarEMostrar);

document.getElementById('btnLimpar')?.addEventListener('click', () => {
  ['filtroMusica', 'filtroNome', 'filtroArtista', 'filtroTom', 'filtroLetra', 'filtroData'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  filtrarEMostrar();
});

// Inicia o carregamento
carregarDados();