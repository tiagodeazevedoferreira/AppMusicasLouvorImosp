// Configurações
const SHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';
const API_KEY = 'AIzaSyDcj5ebPcBXw5Ev6SQHXzxToCGfINprj_A';

// Variáveis globais
let musicas = [];
let dadosFirebaseMap = new Map(); // chave normalizada → { letra, cifra }

// Função para normalizar nomes
function normalizarNome(nome) {
  if (!nome) return '';
  return nome.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

// Carrega dados da Google Sheet e do Firebase
async function carregarDados() {
  try {
    // 1. Carrega músicas da Google Sheet (dados principais)
    const resMusicas = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Músicas?key=${API_KEY}`
    );
    if (!resMusicas.ok) throw new Error('Erro ao carregar Músicas da planilha');
    const dataMusicas = await resMusicas.json();
    musicas = dataMusicas.values.slice(1); // remove cabeçalho
    console.log('Músicas da planilha carregadas:', musicas.length);

    // 2. Tenta carregar do Firebase (não quebra se falhar)
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
          console.log('Dados do Firebase carregados com sucesso:', dadosFirebaseMap.size, 'itens');
        } else {
          console.warn('Nenhum dado encontrado no nó "musicas" do Firebase');
        }
      } catch (fbErr) {
        console.error('Erro ao carregar do Firebase (continuando sem ele):', fbErr);
      }
    } else {
      console.warn('FirebaseDb não inicializado. Certifique-se de que o SDK está carregado no HTML.');
    }

    preencherFiltros();
    filtrarEMostrar();
  } catch (err) {
    console.error('Erro geral ao carregar dados:', err);
    // Mostra mensagem, mas não impede o uso parcial
    document.getElementById('resultados').innerHTML = 
      '<p class="text-warning">Alguns dados não carregaram (Firebase ou planilha). Clique em "Limpar filtros" para tentar novamente.</p>';
    // Continua para mostrar o que foi carregado
    preencherFiltros();
    filtrarEMostrar();
  }
}

function preencherFiltros() {
  // ... (manter igual ao seu código anterior, sem mudanças)
}

function filtrarEMostrar() {
  // ... (manter igual, mas usando dadosFirebaseMap)
  const resultadosFiltrados = musicas.filter(mus => {
    const [nomeMus, tomMus, art, link, dt] = mus;

    const matchMusica = !musicaSelecionada || nomeMus === musicaSelecionada;
    const matchNome = !nome || nomeMus.toLowerCase().includes(nome);
    const matchArtista = !artista || art === artista;
    const matchTom = !tom || tomMus === tom;
    const matchData = !data || dt === data;

    let matchLetra = true;
    if (letraBusca) {
      const chave = normalizarNome(nomeMus);
      const dados = dadosFirebaseMap.get(chave);
      const letraMus = dados ? dados.letra : '';
      matchLetra = letraMus.toLowerCase().includes(letraBusca);
    }

    return matchMusica && matchNome && matchArtista && matchTom && matchData && matchLetra;
  });

  resultadosFiltrados.sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  mostrarResultados(resultadosFiltrados);
}

function mostrarResultados(lista) {
  const container = document.getElementById('resultados');
  container.innerHTML = '';

  if (lista.length === 0) {
    container.innerHTML = '<p class="text-center text-muted">Nenhuma música encontrada com os filtros aplicados.</p>';
    return;
  }

  lista.forEach(mus => {
    const [nomeMus, tom, artista, link, data] = mus;

    const chave = normalizarNome(nomeMus);
    const dadosFb = dadosFirebaseMap.get(chave) || { letra: 'Letra não encontrada', cifra: '' };
    const letra = dadosFb.letra;
    const cifraLink = dadosFb.cifra;

    let videoId = '';
    if (link) {
      const match = link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
      videoId = match ? match[1] : '';
    }

    const hasCifra = cifraLink && typeof cifraLink === 'string' && cifraLink.trim() !== '';

    const card = document.createElement('div');
    card.className = 'col-12';
    card.innerHTML = `
      <div class="card">
        <div class="card-body">
          <h5 class="card-title">${nomeMus}</h5>
          <p class="card-text">
            <strong>Artista:</strong> ${artista} <br>
            <strong>Tom:</strong> ${tom}
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

// Eventos (manter igual)
document.getElementById('filtroMusica').addEventListener('change', filtrarEMostrar);
document.getElementById('filtroNome').addEventListener('input', filtrarEMostrar);
document.getElementById('filtroArtista').addEventListener('change', filtrarEMostrar);
document.getElementById('filtroTom').addEventListener('change', filtrarEMostrar);
document.getElementById('filtroLetra').addEventListener('input', filtrarEMostrar);
document.getElementById('filtroData').addEventListener('change', filtrarEMostrar);

document.getElementById('btnLimpar').addEventListener('click', () => {
  document.getElementById('filtroMusica').value = '';
  document.getElementById('filtroNome').value = '';
  document.getElementById('filtroArtista').value = '';
  document.getElementById('filtroTom').value = '';
  document.getElementById('filtroLetra').value = '';
  document.getElementById('filtroData').value = '';
  filtrarEMostrar();
});

// Inicia
carregarDados();